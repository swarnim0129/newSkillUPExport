const SavedRoadmap = require('../models/SavedRoadmap');
const { deriveTopicCluster } = require('../services/topicClusterService');
const { recordEvent } = require('../services/gamificationService');
const { recordEvidence } = require('../services/evidenceService');

function isTruthyEnv(value, defaultValue) {
  if (value === undefined) return defaultValue;
  return String(value).toLowerCase() === 'true';
}

function isGamificationEnabled() {
  return isTruthyEnv(process.env.GAMIFICATION_ENABLED, true);
}

function isLegacyFallbackEnabled() {
  return isTruthyEnv(process.env.ROADMAP_LEGACY_USERID_FALLBACK, true);
}

function getLegacyUserId() {
  return process.env.ROADMAP_LEGACY_USERID || 'clerk-local-admin';
}

function normalizeNodes(nodes) {
  if (!Array.isArray(nodes)) return [];

  return nodes.map((node) => ({
    ...node,
    resources: Array.isArray(node.resources) ? node.resources : [],
    status: ['not_started', 'in_progress', 'completed'].includes(node.status)
      ? node.status
      : 'not_started',
    completedAt: node.completedAt || null,
    timeSpentMinutes: Number(node.timeSpentMinutes || 0),
    xpAwarded: Number(node.xpAwarded || 0),
  }));
}

function computeProgress(nodes) {
  const totalNodesCount = Array.isArray(nodes) ? nodes.length : 0;
  if (totalNodesCount === 0) {
    return {
      totalNodesCount: 0,
      completedNodesCount: 0,
      progressPercent: 0,
      completedAt: null,
    };
  }

  const completedNodesCount = nodes.filter((n) => n.status === 'completed').length;
  const progressPercent = Math.round((completedNodesCount / totalNodesCount) * 100);

  return {
    totalNodesCount,
    completedNodesCount,
    progressPercent,
    completedAt: completedNodesCount === totalNodesCount ? new Date() : null,
  };
}

function normalizeDifficultyFromText(text) {
  const value = String(text || '').toLowerCase();
  if (!value) return null;

  if (/(beginner|easy|basic|foundation|intro)/.test(value)) return 'beginner';
  if (/(intermediate|medium|mid)/.test(value)) return 'intermediate';
  if (/(advanced|hard)/.test(value)) return 'advanced';
  if (/(expert|pro|master)/.test(value)) return 'expert';

  return null;
}

function inferRoadmapDifficulty(topic) {
  return normalizeDifficultyFromText(topic) || 'intermediate';
}

function inferNodeDifficulty(nodeTopic, nodeIndex, totalNodes, roadmapDifficulty) {
  const explicit = normalizeDifficultyFromText(nodeTopic);
  if (explicit) return explicit;

  const total = Math.max(1, Number(totalNodes || 1));
  const idx = Math.max(0, Number(nodeIndex || 0));
  const ratio = (idx + 1) / total;

  if (ratio <= 0.34) return 'beginner';
  if (ratio <= 0.67) return 'intermediate';
  if (ratio <= 0.9) return 'advanced';
  return roadmapDifficulty || 'advanced';
}

function getPrimaryOwnershipQuery(req) {
  const clauses = [{ clerkId: req.clerkId }, { userId: req.clerkId }];
  if (req.user && req.user._id && req.user.role === 'candidate') {
    clauses.push({ candidate: req.user._id });
  }
  return { $or: clauses };
}

function buildOwnershipQuery(req, id) {
  return {
    _id: id,
    $or: getPrimaryOwnershipQuery(req).$or,
  };
}

async function emitRoadmapEvent(req, payload) {
  if (!isGamificationEnabled()) return;
  try {
    await recordEvent({
      clerkId: req.clerkId,
      ...payload,
    });
  } catch (eventError) {
    console.error('[roadmap] Failed to emit gamification event:', eventError.message);
  }
}

// Tell the journey about roadmap progress. XP is already awarded by emitRoadmapEvent.
function reportRoadmapEvidence(req, roadmap, type, refId, meta = {}) {
  recordEvidence({
    clerkId: req.clerkId,
    type,
    topic: roadmap.topic,
    refId,
    meta,
    skipXp: true,
  }).catch((err) => console.error('[roadmap] Failed to record evidence:', err.message));
}

exports.saveRoadmap = async (req, res) => {
  try {
    const { topic, mermaidCode, nodes } = req.body;
    
    if (!topic || !mermaidCode || !Array.isArray(nodes)) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    const normalizedNodes = normalizeNodes(nodes);
    const progress = computeProgress(normalizedNodes);
    const topicCluster = deriveTopicCluster(topic);

    const roadmap = await SavedRoadmap.create({
      clerkId: req.clerkId,
      candidate: req.user && req.user._id && req.user.role === 'candidate' ? req.user._id : undefined,
      userId: req.clerkId,
      topic,
      mermaidCode,
      topicCluster,
      nodes: normalizedNodes,
      progressPercent: progress.progressPercent,
      completedNodesCount: progress.completedNodesCount,
      totalNodesCount: progress.totalNodesCount,
      completedAt: progress.completedAt,
    });

    await emitRoadmapEvent(req, {
      eventType: 'roadmap_saved',
      source: 'roadmap',
      sourceRef: { roadmapId: roadmap._id },
      topic,
      topicCluster,
      dedupeKey: `roadmap_saved:${req.clerkId}:${roadmap._id}`,
      metadata: {
        totalNodesCount: progress.totalNodesCount,
      },
    });

    res.status(201).json({ success: true, roadmap });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getRoadmaps = async (req, res) => {
  try {
    const primaryQuery = getPrimaryOwnershipQuery(req);
    let roadmaps = await SavedRoadmap.find(primaryQuery).sort({ createdAt: -1 }).limit(20);

    if (roadmaps.length === 0 && isLegacyFallbackEnabled() && req.clerkId === getLegacyUserId()) {
      roadmaps = await SavedRoadmap.find({ userId: getLegacyUserId() }).sort({ createdAt: -1 }).limit(20);
    }

    res.json({ success: true, roadmaps });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getRoadmap = async (req, res) => {
  try {
    const { id } = req.params;

    const primaryQuery = buildOwnershipQuery(req, id);
    
    let roadmap = await SavedRoadmap.findOne(primaryQuery);

    if (!roadmap && isLegacyFallbackEnabled() && req.clerkId === getLegacyUserId()) {
      roadmap = await SavedRoadmap.findOne({ _id: id, userId: getLegacyUserId() });
    }
    
    if (!roadmap) {
      return res.status(404).json({ message: 'Roadmap not found' });
    }
    
    res.json({ success: true, roadmap });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.deleteRoadmap = async (req, res) => {
  try {
    const { id } = req.params;

    const query = buildOwnershipQuery(req, id);
    
    const deleted = await SavedRoadmap.findOneAndDelete(query);

    if (!deleted) {
      return res.status(404).json({ message: 'Roadmap not found' });
    }
    
    res.json({ success: true, message: 'Roadmap deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.updateRoadmapNode = async (req, res) => {
  try {
    const { id, nodeIndex } = req.params;
    const { status, timeSpentMinutes } = req.body || {};
    const index = Number(nodeIndex);

    if (Number.isNaN(index) || index < 0) {
      return res.status(400).json({ message: 'Invalid node index' });
    }

    if (status && !['not_started', 'in_progress', 'completed'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }

    const roadmap = await SavedRoadmap.findOne(buildOwnershipQuery(req, id));

    if (!roadmap) {
      return res.status(404).json({ message: 'Roadmap not found' });
    }

    if (!Array.isArray(roadmap.nodes) || index >= roadmap.nodes.length) {
      return res.status(400).json({ message: 'Node index out of range' });
    }

    const node = roadmap.nodes[index];
    const previousStatus = node.status || 'not_started';

    if (status) {
      node.status = status;
      if (status === 'completed' && previousStatus !== 'completed') {
        node.completedAt = new Date();
      }
      if (status !== 'completed' && previousStatus === 'completed') {
        node.completedAt = null;
      }
    }

    if (timeSpentMinutes !== undefined) {
      node.timeSpentMinutes = Math.max(0, Number(timeSpentMinutes || 0));
    }

    const progress = computeProgress(roadmap.nodes);
    const wasComplete = roadmap.completedAt != null;

    roadmap.progressPercent = progress.progressPercent;
    roadmap.completedNodesCount = progress.completedNodesCount;
    roadmap.totalNodesCount = progress.totalNodesCount;
    // Keep the original completion date; only set or clear it when the state flips
    if (!progress.completedAt) roadmap.completedAt = null;
    else if (!roadmap.completedAt) roadmap.completedAt = progress.completedAt;

    await roadmap.save();

    const transitionedToCompleted = previousStatus !== 'completed' && node.status === 'completed';
    if (transitionedToCompleted) {
      const resourcesCount = Array.isArray(node.resources) ? node.resources.length : 0;
      const roadmapDifficulty = inferRoadmapDifficulty(roadmap.topic);
      const nodeDifficulty = inferNodeDifficulty(node.topic, index, roadmap.totalNodesCount, roadmapDifficulty);

      await emitRoadmapEvent(req, {
        eventType: 'roadmap_node_completed',
        source: 'roadmap',
        sourceRef: { roadmapId: roadmap._id, nodeIndex: index },
        topic: roadmap.topic,
        topicCluster: roadmap.topicCluster,
        dedupeKey: `roadmap_node_completed:${req.clerkId}:${roadmap._id}:${index}`,
        metadata: {
          nodeTopic: node.topic || null,
          resourcesCount,
          completedVideoCount: Math.max(1, resourcesCount),
          totalNodesCount: roadmap.totalNodesCount,
          nodeDifficulty,
          roadmapDifficulty,
        },
      });
      reportRoadmapEvidence(req, roadmap, 'roadmap_node_completed', `${roadmap._id}:${index}`, {
        nodeTopic: node.topic || null,
        progressPercent: roadmap.progressPercent,
      });
    }

    const nowComplete = roadmap.completedAt != null;
    if (!wasComplete && nowComplete) {
      reportRoadmapEvidence(req, roadmap, 'roadmap_completed', String(roadmap._id));
      await emitRoadmapEvent(req, {
        eventType: 'roadmap_completed',
        source: 'roadmap',
        sourceRef: { roadmapId: roadmap._id },
        topic: roadmap.topic,
        topicCluster: roadmap.topicCluster,
        dedupeKey: `roadmap_completed:${req.clerkId}:${roadmap._id}`,
        metadata: {
          totalNodesCount: roadmap.totalNodesCount,
        },
      });
    }

    return res.json({ success: true, roadmap });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.completeRoadmap = async (req, res) => {
  try {
    const { id } = req.params;

    const roadmap = await SavedRoadmap.findOne(buildOwnershipQuery(req, id));

    if (!roadmap) {
      return res.status(404).json({ message: 'Roadmap not found' });
    }

    const wasComplete = roadmap.completedAt != null;
    const roadmapDifficulty = inferRoadmapDifficulty(roadmap.topic);
    const nodeSnapshots = (roadmap.nodes || []).map((node, idx) => ({
      index: idx,
      status: node.status || 'not_started',
      topic: node.topic || null,
      resourcesCount: Array.isArray(node.resources) ? node.resources.length : 0,
    }));

    roadmap.nodes = (roadmap.nodes || []).map((node) => {
      const raw = typeof node.toObject === 'function' ? node.toObject() : node;
      const next = {
        ...raw,
        status: 'completed',
      };
      if (!next.completedAt) {
        next.completedAt = new Date();
      }
      return next;
    });

    const progress = computeProgress(roadmap.nodes);
    roadmap.progressPercent = progress.progressPercent;
    roadmap.completedNodesCount = progress.completedNodesCount;
    roadmap.totalNodesCount = progress.totalNodesCount;
    roadmap.completedAt = progress.completedAt || new Date();

    await roadmap.save();

    const newlyCompleted = nodeSnapshots.filter((node) => node.status !== 'completed');
    for (const node of newlyCompleted) {
      const nodeDifficulty = inferNodeDifficulty(node.topic, node.index, roadmap.totalNodesCount, roadmapDifficulty);
      await emitRoadmapEvent(req, {
        eventType: 'roadmap_node_completed',
        source: 'roadmap',
        sourceRef: { roadmapId: roadmap._id, nodeIndex: node.index },
        topic: roadmap.topic,
        topicCluster: roadmap.topicCluster,
        dedupeKey: `roadmap_node_completed:${req.clerkId}:${roadmap._id}:${node.index}`,
        metadata: {
          nodeTopic: node.topic,
          resourcesCount: node.resourcesCount,
          completedVideoCount: Math.max(1, node.resourcesCount),
          totalNodesCount: roadmap.totalNodesCount,
          nodeDifficulty,
          roadmapDifficulty,
        },
      });
    }

    if (!wasComplete) {
      reportRoadmapEvidence(req, roadmap, 'roadmap_completed', String(roadmap._id));
      await emitRoadmapEvent(req, {
        eventType: 'roadmap_completed',
        source: 'roadmap',
        sourceRef: { roadmapId: roadmap._id },
        topic: roadmap.topic,
        topicCluster: roadmap.topicCluster,
        dedupeKey: `roadmap_completed:${req.clerkId}:${roadmap._id}`,
        metadata: {
          totalNodesCount: roadmap.totalNodesCount,
        },
      });
    }

    return res.json({ success: true, roadmap });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// ─── Agent-to-Agent Handoff: Adapt Active Roadmap ─────────────────────────
// Called when the Quiz Agent detects a student has failed a quiz.
// This method:
//   1. Finds the user's most recent active (incomplete) roadmap.
//   2. Calls the Python Planning Agent to generate a targeted remedial node.
//   3. Splices the remedial node into the roadmap after the last completed node.
//   4. Updates the Mermaid code to include the remedial node with visual highlight.
//   5. Saves to MongoDB and returns the updated roadmap.
exports.adaptActiveRoadmap = async (req, res) => {
  try {
    const { subjectName, chapterTitle, score, total } = req.body;

    if (!subjectName || !chapterTitle) {
      return res.status(400).json({ message: 'subjectName and chapterTitle are required' });
    }

    // Step 1: Find the user's most recent active (incomplete) roadmap
    const primaryQuery = getPrimaryOwnershipQuery(req);
    const roadmap = await SavedRoadmap.findOne({
      ...primaryQuery,
      completedAt: null, // Only adapt incomplete roadmaps
    }).sort({ createdAt: -1 });

    if (!roadmap) {
      return res.status(404).json({
        message: 'No active roadmap found to adapt',
        adapted: false,
      });
    }

    // One open review node per failed chapter is enough
    const alreadyQueued = (roadmap.nodes || []).some(
      (n) => n.triggeredBy === chapterTitle && n.status !== 'completed'
    );
    if (alreadyQueued) {
      return res.json({
        success: true,
        adapted: false,
        roadmap,
        message: `A review of "${chapterTitle}" is already in your roadmap.`,
      });
    }

    // Step 2: Call the Python Planning Agent (Agent-to-Agent Handoff)
    const BACKEND2_URL = process.env.BACKEND2_URL || 'http://localhost:8000';

    let remedialNode;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 60000); // 60s timeout

      const response = await fetch(
        `${BACKEND2_URL}/api/learning/public/generate-remedial-node`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            original_topic: roadmap.topic,
            failed_concept: chapterTitle,
          }),
          signal: controller.signal,
        }
      );
      clearTimeout(timeout);

      const data = await response.json();

      if (!data?.success || !data?.remedial_node) {
        throw new Error('Planning Agent returned an invalid response');
      }

      remedialNode = data.remedial_node;
    } catch (agentError) {
      console.error('[adaptActiveRoadmap] Planning Agent call failed:', agentError.message);
      // Fallback: create a minimal remedial node without AI
      remedialNode = {
        topic: `🔁 Review: ${chapterTitle}`,
        resources: [],
        fetched_at: new Date().toISOString(),
        is_remedial: true,
        triggered_by: chapterTitle,
        original_topic: roadmap.topic,
      };
    }

    // Step 3: Find insertion point — after the last completed node
    const nodes = roadmap.nodes || [];
    let insertIndex = 0;
    for (let i = nodes.length - 1; i >= 0; i--) {
      if (nodes[i].status === 'completed') {
        insertIndex = i + 1;
        break;
      }
    }

    // Build the new node in Mongoose-compatible format
    const newNode = {
      topic: remedialNode.topic,
      resources: (remedialNode.resources || []).map((r) => ({
        title: r.title || 'Resource',
        url: r.url || '',
        platform: r.platform || 'Web',
        thumbnail: r.thumbnail || null,
        duration: r.duration || null,
        is_free: r.is_free !== false,
        rating: r.rating || null,
        instructor: r.instructor || null,
      })),
      fetched_at: remedialNode.fetched_at || new Date().toISOString(),
      status: 'not_started',
      completedAt: null,
      timeSpentMinutes: 0,
      xpAwarded: 0,
      triggeredBy: chapterTitle,
    };

    // Splice into the nodes array
    roadmap.nodes.splice(insertIndex, 0, newNode);

    // Step 4: Update the Mermaid code to include the remedial node
    const nodeId = `REMEDIAL_${Date.now()}`;
    const safeLabel = newNode.topic.replace(/[[\]"]/g, '');

    // Extract all real node IDs from the Mermaid code (lines with --> tell us node IDs)
    let updatedMermaid = roadmap.mermaidCode.trimEnd();
    const mermaidLines = updatedMermaid.split('\n');

    // Collect all node IDs that appear in edge definitions
    const edgeNodeIds = [];
    for (const line of mermaidLines) {
      const edgeMatch = line.trim().match(/^(\w+)\s*-->\s*(\w+)/);
      if (edgeMatch) {
        edgeNodeIds.push(edgeMatch[1], edgeMatch[2]);
      }
    }
    // Collect standalone node definitions too
    const allNodeIds = new Set(edgeNodeIds);
    for (const line of mermaidLines) {
      const nodeMatch = line.trim().match(/^(\w+)\s*[\[("]/);
      if (nodeMatch && !line.trim().startsWith('classDef') && !line.trim().startsWith('class ') && !line.trim().startsWith('graph') && !line.trim().startsWith('%%') && !line.trim().startsWith('style')) {
        allNodeIds.add(nodeMatch[1]);
      }
    }

    // Remove REMEDIAL_ nodes from candidates (don't chain from an old remedial)
    const candidateIds = Array.from(allNodeIds).filter(id => !id.startsWith('REMEDIAL_') && !id.startsWith('classDef'));
    // The last meaningful node is what we connect from
    const prevNodeId = candidateIds.length > 0 ? candidateIds[candidateIds.length - 1] : null;

    // Remove any existing classDef remedial line so we don't duplicate
    updatedMermaid = updatedMermaid.replace(/\n\s*classDef remedial[^\n]*/g, '');

    updatedMermaid += `\n    ${nodeId}["⚡ ${safeLabel}"]:::remedial`;
    if (prevNodeId) {
      updatedMermaid += `\n    ${prevNodeId} --> ${nodeId}`;
    }
    updatedMermaid += `\n    classDef remedial fill:#ff6b35,stroke:#ff4500,color:#fff,stroke-width:2px`;
    roadmap.mermaidCode = updatedMermaid;

    // Step 5: Recalculate progress and save
    const progress = computeProgress(roadmap.nodes);
    roadmap.progressPercent = progress.progressPercent;
    roadmap.completedNodesCount = progress.completedNodesCount;
    roadmap.totalNodesCount = progress.totalNodesCount;
    roadmap.completedAt = progress.completedAt;

    await roadmap.save();

    // Emit gamification event for roadmap adaptation
    await emitRoadmapEvent(req, {
      eventType: 'roadmap_adapted',
      source: 'feedback_loop',
      sourceRef: { roadmapId: roadmap._id, insertedAt: insertIndex },
      topic: roadmap.topic,
      topicCluster: roadmap.topicCluster,
      dedupeKey: `roadmap_adapted:${req.clerkId}:${roadmap._id}:${chapterTitle}`,
      metadata: {
        failedConcept: chapterTitle,
        quizScore: score || null,
        quizTotal: total || null,
        remedialTopic: newNode.topic,
      },
    });

    console.log(
      `[adaptActiveRoadmap] ✅ Agent Handoff complete — injected "${newNode.topic}" into roadmap "${roadmap.topic}" at position ${insertIndex}`
    );

    return res.json({
      success: true,
      adapted: true,
      roadmap,
      remedialNode: {
        topic: newNode.topic,
        insertedAt: insertIndex,
        resourceCount: newNode.resources.length,
      },
      message: `Your learning path has been adapted. A focused review on "${chapterTitle}" has been added to your roadmap.`,
    });
  } catch (error) {
    console.error('[adaptActiveRoadmap] Error:', error.message);
    return res.status(500).json({ message: error.message });
  }
};