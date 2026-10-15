// Single entry point for "the student did something". Every tool reports here.
// One call stores the event, updates the measured skill level, awards XP and
// lets the plan react.

const Candidate = require('../models/Candidate');
const StudentProfile = require('../models/StudentProfile');
const StudentEvent = require('../models/StudentEvent');
const JourneyPlan = require('../models/JourneyPlan');
const { recordEvent } = require('./gamificationService');
const { applyEvidence } = require('./journey/planService');
const { journeyNow } = require('./journey/clock');

// How quickly a new result moves the estimate. Early results count for more
// because there is little else to go on.
const BASE_WEIGHT = 0.35;
// Finishing learning material alone cannot take a skill past this level;
// only tested results (quizzes, interviews, resume scores) can.
const UNTESTED_CAP = 60;
const MAX_SKILLS = 40;

// Events that also earn XP, and the gamification source they belong to
const XP_SOURCES = {
  quiz_completed: 'tutor',
  tutor_chapter_completed: 'tutor',
  resume_analyzed: 'resume',
  resume_generated: 'resume',
  interview_completed: 'interview',
  dsa_solved: 'practice',
};

function skillKey(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9+#]+/g, ' ')
    .trim()
    .slice(0, 60);
}

function upsertSkill(profile, name, apply, now) {
  const key = skillKey(name);
  if (!key) return null;

  let skill = profile.skills.find((s) => s.key === key);
  if (!skill) {
    if (profile.skills.length >= MAX_SKILLS) return null;
    profile.skills.push({ key, name: String(name).trim().slice(0, 60), level: 0, evidenceCount: 0 });
    skill = profile.skills[profile.skills.length - 1];
  }
  apply(skill);
  skill.level = Math.max(0, Math.min(100, Math.round(skill.level)));
  skill.updatedAt = now;
  return skill;
}

/**
 * Move a skill estimate toward a tested score (0-100).
 * The first result sets the level outright; later ones blend in.
 */
function applyScore(profile, name, score, now = new Date()) {
  return upsertSkill(
    profile,
    name,
    (skill) => {
      const weight = skill.evidenceCount === 0 ? 1 : Math.max(BASE_WEIGHT, 1 / (skill.evidenceCount + 1));
      skill.level = skill.level + weight * (score - skill.level);
      skill.evidenceCount += 1;
      skill.lastScore = score;
    },
    now
  );
}

/**
 * Record study progress (percent of a roadmap finished) without a test result.
 */
function applyProgress(profile, name, progressPercent, now = new Date()) {
  return upsertSkill(
    profile,
    name,
    (skill) => {
      const fromProgress = (Math.max(0, Math.min(100, progressPercent)) / 100) * UNTESTED_CAP;
      skill.level = Math.max(skill.level, fromProgress);
    },
    now
  );
}

function updateSkills(profile, event, now) {
  const meta = event.meta || {};
  const hasScore = typeof event.score === 'number';

  switch (event.type) {
    case 'quiz_completed':
      if (hasScore && event.topic) applyScore(profile, event.topic, event.score, now);
      break;
    case 'interview_completed':
      if (typeof meta.technical === 'number' && event.topic) applyScore(profile, event.topic, meta.technical * 10, now);
      if (typeof meta.communication === 'number') applyScore(profile, 'Communication', meta.communication * 10, now);
      if (hasScore) applyScore(profile, 'Interviewing', event.score, now);
      break;
    case 'resume_analyzed':
      if (hasScore) applyScore(profile, 'Resume', event.score, now);
      break;
    case 'dsa_solved':
      // The pattern level is computed from all problems, with review decay; use it as is
      if (event.topic && typeof meta.patternLevel === 'number') {
        upsertSkill(profile, `DSA: ${event.topic}`, (skill) => {
          skill.level = meta.patternLevel;
          skill.evidenceCount += 1;
          skill.lastScore = event.score;
        }, now);
      }
      break;
    case 'roadmap_node_completed':
    case 'roadmap_completed':
      if (event.topic) {
        const progress = event.type === 'roadmap_completed' ? 100 : Number(meta.progressPercent) || 0;
        applyProgress(profile, event.topic, progress, now);
      }
      break;
    default:
      break;
  }
}

async function awardXp(clerkId, event) {
  const source = XP_SOURCES[event.type];
  if (!source || !event.refId) return;
  if (String(process.env.GAMIFICATION_ENABLED || 'true').toLowerCase() === 'false') return;

  try {
    await recordEvent({
      clerkId,
      eventType: event.type,
      source,
      sourceRef: { refId: event.refId },
      topic: event.topic || undefined,
      dedupeKey: `${event.type}:${clerkId}:${event.refId}`,
      metadata: { ...(event.meta || {}), score: event.score, total: 100 },
    });
  } catch (err) {
    console.error('[evidence] XP award failed:', err.message);
  }
}

/**
 * Record one piece of evidence.
 *
 * @param {object} input
 * @param {string} input.clerkId
 * @param {string} input.type     one of the StudentEvent types
 * @param {string} [input.topic]  subject, role or roadmap topic
 * @param {number} [input.score]  0-100 when the event has a measurable result
 * @param {string} [input.refId]  id of the thing done; repeats with the same id are ignored
 * @param {object} [input.meta]
 * @param {boolean} [input.skipXp] true when the caller already awarded XP itself
 * @returns {Promise<{duplicate: boolean, planChanges: Array}>}
 */
async function recordEvidence({ clerkId, type, topic = '', score = null, refId = null, meta = {}, skipXp = false }) {
  const candidate = await Candidate.findOne({ clerkId }).select('_id clerkId').lean();
  if (!candidate) return { duplicate: false, planChanges: [] };

  const cleanScore = typeof score === 'number' && Number.isFinite(score) ? Math.max(0, Math.min(100, Math.round(score))) : null;
  const profile = await StudentProfile.findOne({ candidate: candidate._id });
  const now = profile ? journeyNow(profile) : new Date();

  const event = {
    candidate: candidate._id,
    clerkId,
    type,
    topic: String(topic || '').slice(0, 160),
    score: cleanScore,
    refId: refId ? String(refId) : null,
    meta,
    occurredAt: now,
  };

  try {
    await StudentEvent.create(event);
  } catch (err) {
    // Same (type, refId) already recorded: the unique index rejects the repeat
    if (err && err.code === 11000) return { duplicate: true, planChanges: [] };
    throw err;
  }

  if (!skipXp) await awardXp(clerkId, event);

  // Events still count before the journey is set up; they are replayed into the profile at setup
  if (!profile) return { duplicate: false, planChanges: [] };

  updateSkills(profile, event, now);
  await profile.save();

  const plan = await JourneyPlan.findOne({ candidate: candidate._id });
  if (!plan) return { duplicate: false, planChanges: [] };

  const planChanges = applyEvidence(profile, plan, event, now);
  await plan.save();

  // Class work checked from this kind of result may now be done
  try {
    const { syncStudent } = require('./classroomService');
    await syncStudent(candidate._id);
  } catch (err) {
    console.error('[evidence] class sync error:', err.message);
  }

  return { duplicate: false, planChanges };
}

/**
 * Rebuild skill levels from the stored event history. Used when a profile is
 * created after the student has already been using the tools.
 */
async function replayHistory(profile) {
  const events = await StudentEvent.find({ candidate: profile.candidate }).sort({ occurredAt: 1 }).lean();
  events.forEach((event) => updateSkills(profile, event, event.occurredAt));
  return events.length;
}

module.exports = { recordEvidence, replayHistory, applyScore, applyProgress, updateSkills, skillKey };
