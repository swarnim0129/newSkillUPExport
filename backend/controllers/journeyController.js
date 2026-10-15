const StudentProfile = require('../models/StudentProfile');
const JourneyPlan = require('../models/JourneyPlan');
const StudentEvent = require('../models/StudentEvent');
const CompanionMessage = require('../models/CompanionMessage');
const { recordEvidence, replayHistory } = require('../services/evidenceService');
const { createPlan, syncWithClock, rebuildFuture, logChange, isOpen } = require('../services/journey/planService');
const { composeWelcome, welcomeWidgets, ensureCheckIn, reply } = require('../services/companionService');
const { listPersonas, loadPersona } = require('../services/journey/demoPersonas');
const PracticeProgress = require('../models/PracticeProgress');
const { forecast } = require('../services/journey/forecastService');
const { addExam, removeExam } = require('../services/journey/examService');
const { syncStudent } = require('../services/classroomService');
const { patternOverview } = require('../services/practice/masteryService');
const { journeyNow, currentSemester, yearOfSemester, stageFor, STAGES, TOTAL_SEMESTERS } = require('../services/journey/clock');

const GOAL_TYPES = ['placement', 'higher_studies', 'govt_exam', 'startup', 'undecided'];
const MILESTONE_STATUSES = ['pending', 'in_progress', 'done', 'skipped'];
const CLIENT_EVIDENCE_TYPES = ['quiz_completed', 'tutor_chapter_completed'];

// Fast-forward and demo students are for presentations, never for a live deployment
function demoEnabled() {
  if (process.env.JOURNEY_DEMO === 'true') return true;
  if (process.env.JOURNEY_DEMO === 'false') return false;
  return process.env.NODE_ENV !== 'production';
}

function firstNameOf(req) {
  return String(req.user.firstName || '').trim() || 'there';
}

function cleanText(value, max) {
  return String(value || '').trim().slice(0, max);
}

function cleanList(value, maxItems, maxLength) {
  const list = Array.isArray(value) ? value : String(value || '').split(',');
  return list.map((item) => cleanText(item, maxLength)).filter(Boolean).slice(0, maxItems);
}

function readGoal(body) {
  const goal = body && body.goal ? body.goal : {};
  return {
    type: GOAL_TYPES.includes(goal.type) ? goal.type : 'undecided',
    targetRole: cleanText(goal.targetRole, 80),
    note: cleanText(goal.note, 200),
  };
}

function clampNumber(value, min, max, fallback) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

async function loadJourney(req) {
  const [profile, plan] = await Promise.all([
    StudentProfile.findOne({ candidate: req.user._id }),
    JourneyPlan.findOne({ candidate: req.user._id }),
  ]);
  return { profile, plan };
}

async function dsaLevels(candidateId, now) {
  const progress = await PracticeProgress.find({ candidate: candidateId }).lean();
  return patternOverview(progress, now).levels;
}

// One readiness reading per journey day; the forecast measures pace from these
async function takeReading(profile, plan) {
  const now = journeyNow(profile);
  const result = forecast(profile, plan, await dsaLevels(profile.candidate, now), now);
  await profile.save();
  return result;
}

async function serialize(profile, plan) {
  const now = journeyNow(profile);
  const semester = currentSemester(profile, now);
  const year = yearOfSemester(semester);
  const milestones = plan.milestones
    .map((m) => m.toObject())
    .sort((a, b) => a.semester - b.semester || new Date(a.dueAt) - new Date(b.dueAt));

  const counted = milestones.filter((m) => m.status !== 'skipped');
  const done = counted.filter((m) => m.status === 'done').length;
  const open = milestones.filter(isOpen);

  const recentEvents = await StudentEvent.find({ candidate: profile.candidate })
    .sort({ occurredAt: -1 })
    .limit(8)
    .select('type topic score occurredAt')
    .lean();

  const lastReading = (profile.readinessHistory || [])[profile.readinessHistory.length - 1];

  return {
    exams: (profile.exams || [])
      .filter((e) => new Date(e.endAt) >= now)
      .sort((a, b) => new Date(a.startAt) - new Date(b.startAt))
      .map((e) => ({ id: String(e._id), title: e.title, startAt: e.startAt, endAt: e.endAt })),
    readiness: lastReading ? lastReading.value : null,
    profile: {
      college: profile.college,
      degree: profile.degree,
      branch: profile.branch,
      goal: profile.goal,
      hoursPerWeek: profile.hoursPerWeek,
      interests: profile.interests,
      memory: profile.memory,
      clockOffsetDays: profile.clockOffsetDays,
    },
    now,
    semester,
    year,
    totalSemesters: TOTAL_SEMESTERS,
    stage: stageFor(year),
    stages: Object.values(STAGES).map(({ year: y, name, focus }) => ({ year: y, name, focus })),
    skills: [...profile.skills].map((s) => s.toObject()).sort((a, b) => b.level - a.level),
    milestones,
    changeLog: plan.changeLog.map((c) => c.toObject()).reverse().slice(0, 30),
    generatedBy: plan.generatedBy,
    stats: {
      total: counted.length,
      done,
      open: open.length,
      overdue: open.filter((m) => new Date(m.dueAt) < now).length,
      percent: counted.length ? Math.round((done / counted.length) * 100) : 0,
    },
    recentEvents,
  };
}

// GET /api/journey
exports.getJourney = async (req, res) => {
  try {
    const { profile, plan } = await loadJourney(req);
    if (!profile || !plan) {
      return res.json({ success: true, exists: false, demoEnabled: demoEnabled(), personas: demoEnabled() ? listPersonas() : [] });
    }

    // Time passing is itself a reason for the plan to change
    if (syncWithClock(profile, plan)) await plan.save();
    await takeReading(profile, plan);

    res.json({
      success: true,
      exists: true,
      demoEnabled: demoEnabled(),
      personas: demoEnabled() ? listPersonas() : [],
      journey: await serialize(profile, plan),
    });
  } catch (error) {
    console.error('[journey] get error:', error);
    res.status(500).json({ message: 'Failed to load journey' });
  }
};

// POST /api/journey/setup
exports.setupJourney = async (req, res) => {
  try {
    const branch = cleanText(req.body.branch, 80);
    const semester = Math.round(Number(req.body.semester));

    if (!branch) return res.status(400).json({ message: 'Branch is required' });
    if (!Number.isFinite(semester) || semester < 1 || semester > TOTAL_SEMESTERS) {
      return res.status(400).json({ message: `Semester must be between 1 and ${TOTAL_SEMESTERS}` });
    }

    const existing = await StudentProfile.findOne({ candidate: req.user._id });
    if (existing) return res.status(409).json({ message: 'Journey is already set up' });

    const goal = readGoal(req.body);
    const profile = new StudentProfile({
      candidate: req.user._id,
      clerkId: req.clerkId,
      college: cleanText(req.body.college, 120),
      branch,
      semesterAtSetup: semester,
      setupAt: new Date(),
      goal,
      hoursPerWeek: clampNumber(req.body.hoursPerWeek, 1, 60, 8),
      interests: cleanList(req.body.interests, 8, 40),
      memory: [
        {
          text: `Joined in semester ${semester} of ${branch}${goal.type !== 'undecided' ? ` with the goal: ${goal.type.replace('_', ' ')}${goal.targetRole ? ` (${goal.targetRole})` : ''}` : ', goal not decided yet'}.`,
          source: 'setup',
        },
      ],
    });

    // Results from tools used before setup count from day one
    await replayHistory(profile);

    const plan = await createPlan(req.user, profile);
    profile.lastCheckInAt = journeyNow(profile);

    await profile.save();
    await JourneyPlan.deleteOne({ candidate: req.user._id });
    await plan.save();
    // Work from classes joined before setup goes into the new plan
    await syncStudent(req.user._id).catch((err) => console.error('[journey] class sync error:', err.message));

    await CompanionMessage.create({
      candidate: req.user._id,
      clerkId: req.clerkId,
      role: 'companion',
      kind: 'welcome',
      content: composeWelcome(profile, plan, firstNameOf(req)),
      widgets: welcomeWidgets(profile, plan, firstNameOf(req)),
    });

    res.status(201).json({ success: true, journey: await serialize(profile, plan) });
  } catch (error) {
    console.error('[journey] setup error:', error);
    res.status(500).json({ message: 'Failed to set up journey' });
  }
};

// PATCH /api/journey/profile
exports.updateProfile = async (req, res) => {
  try {
    const { profile, plan } = await loadJourney(req);
    if (!profile || !plan) return res.status(404).json({ message: 'Journey not set up' });

    const before = `${profile.branch}|${profile.goal.type}|${profile.goal.targetRole}`;

    if (req.body.college !== undefined) profile.college = cleanText(req.body.college, 120);
    if (req.body.branch) profile.branch = cleanText(req.body.branch, 80);
    if (req.body.hoursPerWeek !== undefined) profile.hoursPerWeek = clampNumber(req.body.hoursPerWeek, 1, 60, profile.hoursPerWeek);
    if (req.body.interests !== undefined) profile.interests = cleanList(req.body.interests, 8, 40);
    if (req.body.goal) profile.goal = readGoal(req.body);

    if (req.body.semester !== undefined) {
      const semester = Math.round(Number(req.body.semester));
      if (!Number.isFinite(semester) || semester < 1 || semester > TOTAL_SEMESTERS) {
        return res.status(400).json({ message: `Semester must be between 1 and ${TOTAL_SEMESTERS}` });
      }
      // Re-anchor: "today I am in this semester"
      profile.semesterAtSetup = semester;
      profile.setupAt = journeyNow(profile);
    }

    const after = `${profile.branch}|${profile.goal.type}|${profile.goal.targetRole}`;
    if (after !== before) {
      const label = `${profile.goal.type.replace('_', ' ')}${profile.goal.targetRole ? ` (${profile.goal.targetRole})` : ''}`;
      await rebuildFuture(profile, plan, 'goal_change', `Goal or branch changed (${label}). Future milestones were rebuilt around it.`);
    }

    await profile.save();
    await plan.save();
    res.json({ success: true, journey: await serialize(profile, plan) });
  } catch (error) {
    console.error('[journey] profile update error:', error);
    res.status(500).json({ message: 'Failed to update profile' });
  }
};

// PATCH /api/journey/milestones/:id
exports.updateMilestone = async (req, res) => {
  try {
    const { status } = req.body || {};
    if (!MILESTONE_STATUSES.includes(status)) return res.status(400).json({ message: 'Invalid status' });

    const { profile, plan } = await loadJourney(req);
    if (!profile || !plan) return res.status(404).json({ message: 'Journey not set up' });

    const milestone = plan.milestones.id(req.params.id);
    if (!milestone) return res.status(404).json({ message: 'Milestone not found' });
    if (milestone.origin === 'mentor' && status !== 'in_progress') {
      return res.status(400).json({ message: 'This is class work. It is marked done from the class when you finish it.' });
    }

    const now = journeyNow(profile);
    const previous = milestone.status;
    milestone.status = status;
    milestone.completedAt = status === 'done' ? now : null;

    if (status === 'done' && previous !== 'done') {
      logChange(plan, 'manual', `You marked "${milestone.title}" as done.`, [{ action: 'complete', title: milestone.title, detail: 'Marked done by you.' }], now);
      await StudentEvent.create({
        candidate: req.user._id,
        clerkId: req.clerkId,
        type: 'milestone_done',
        topic: milestone.title,
        refId: String(milestone._id),
        occurredAt: now,
      }).catch(() => null); // already recorded once for this milestone
    }

    await plan.save();
    res.json({ success: true, journey: await serialize(profile, plan) });
  } catch (error) {
    console.error('[journey] milestone update error:', error);
    res.status(500).json({ message: 'Failed to update milestone' });
  }
};

// POST /api/journey/evidence — results the browser reports (tutor quizzes and chapters)
exports.postEvidence = async (req, res) => {
  try {
    const { type, topic, refId } = req.body || {};
    if (!CLIENT_EVIDENCE_TYPES.includes(type)) return res.status(400).json({ message: 'Unsupported evidence type' });
    if (!refId) return res.status(400).json({ message: 'refId is required' });

    let score = null;
    const rawScore = Number(req.body.score);
    const total = Number(req.body.total);
    if (Number.isFinite(rawScore)) {
      score = Number.isFinite(total) && total > 0 ? (rawScore / total) * 100 : rawScore;
    }

    const result = await recordEvidence({
      clerkId: req.clerkId,
      type,
      topic: cleanText(topic, 160),
      score,
      refId: cleanText(refId, 120),
    });

    res.json({ success: true, duplicate: result.duplicate, planChanges: result.planChanges });
  } catch (error) {
    console.error('[journey] evidence error:', error);
    res.status(500).json({ message: 'Failed to record result' });
  }
};

// POST /api/journey/replan
exports.replan = async (req, res) => {
  try {
    const { profile, plan } = await loadJourney(req);
    if (!profile || !plan) return res.status(404).json({ message: 'Journey not set up' });

    await rebuildFuture(profile, plan, 'manual', 'You asked for the plan to be rebuilt from where you are now.');
    await plan.save();
    res.json({ success: true, journey: await serialize(profile, plan) });
  } catch (error) {
    console.error('[journey] replan error:', error);
    res.status(500).json({ message: 'Failed to rebuild plan' });
  }
};

// ─── Demo controls ──────────────────────────────────────────────────────────

// POST /api/journey/demo/advance  { days }
exports.demoAdvance = async (req, res) => {
  try {
    if (!demoEnabled()) return res.status(403).json({ message: 'Demo controls are disabled' });

    const { profile, plan } = await loadJourney(req);
    if (!profile || !plan) return res.status(404).json({ message: 'Journey not set up' });

    profile.clockOffsetDays = (profile.clockOffsetDays || 0) + clampNumber(req.body.days, 1, 400, 30);
    syncWithClock(profile, plan);
    await plan.save();
    await takeReading(profile, plan);
    res.json({ success: true, journey: await serialize(profile, plan) });
  } catch (error) {
    console.error('[journey] demo advance error:', error);
    res.status(500).json({ message: 'Failed to advance time' });
  }
};

// POST /api/journey/demo/persona  { key }
exports.demoPersona = async (req, res) => {
  try {
    if (!demoEnabled()) return res.status(403).json({ message: 'Demo controls are disabled' });

    const loaded = await loadPersona(req.user, req.body.key);
    if (!loaded) return res.status(400).json({ message: 'Unknown demo student' });
    await syncStudent(req.user._id).catch((err) => console.error('[journey] class sync error:', err.message));
    const plan = await JourneyPlan.findOne({ candidate: req.user._id });
    res.json({ success: true, journey: await serialize(loaded.profile, plan || loaded.plan) });
  } catch (error) {
    console.error('[journey] demo persona error:', error);
    res.status(500).json({ message: 'Failed to load demo student' });
  }
};

// ─── Companion ──────────────────────────────────────────────────────────────

// GET /api/journey/companion
exports.getThread = async (req, res) => {
  try {
    const { profile, plan } = await loadJourney(req);
    if (!profile || !plan) return res.status(404).json({ message: 'Journey not set up' });

    if (syncWithClock(profile, plan)) await plan.save();
    // The companion starts the conversation when a week has passed
    await ensureCheckIn(req.user, profile, plan, firstNameOf(req));

    const messages = (
      await CompanionMessage.find({ candidate: req.user._id }).sort({ createdAt: -1 }).limit(60).lean()
    ).reverse();

    const now = journeyNow(profile);
    const year = yearOfSemester(currentSemester(profile, now));
    res.json({ success: true, messages, stage: stageFor(year), memory: profile.memory });
  } catch (error) {
    console.error('[companion] thread error:', error);
    res.status(500).json({ message: 'Failed to load conversation' });
  }
};

// POST /api/journey/companion  { message }
exports.postMessage = async (req, res) => {
  try {
    const message = cleanText(req.body.message, 2000);
    if (!message) return res.status(400).json({ message: 'Message is required' });

    const { profile, plan } = await loadJourney(req);
    if (!profile || !plan) return res.status(404).json({ message: 'Journey not set up' });

    const result = await reply(req.user, profile, plan, message, firstNameOf(req));
    res.json({
      success: true,
      messages: [result.userMessage, result.companionMessage],
      planChanged: result.planChanged,
      memory: profile.memory,
    });
  } catch (error) {
    console.error('[companion] message error:', error);
    res.status(500).json({ message: 'Failed to send message' });
  }
};

// ─── Forecast, exams and mentor ─────────────────────────────────────────────

// GET /api/journey/forecast
exports.getForecast = async (req, res) => {
  try {
    const { profile, plan } = await loadJourney(req);
    if (!profile || !plan) return res.status(404).json({ message: 'Journey not set up' });
    res.json({ success: true, forecast: await takeReading(profile, plan) });
  } catch (error) {
    console.error('[journey] forecast error:', error);
    res.status(500).json({ message: 'Failed to build the forecast' });
  }
};

// POST /api/journey/exams  { title, startAt, endAt }
exports.addExam = async (req, res) => {
  try {
    const { profile, plan } = await loadJourney(req);
    if (!profile || !plan) return res.status(404).json({ message: 'Journey not set up' });

    const result = addExam(profile, plan, req.body || {});
    if (result.error) return res.status(400).json({ message: result.error });
    await profile.save();
    await plan.save();
    res.status(201).json({ success: true, changes: result.changes, journey: await serialize(profile, plan) });
  } catch (error) {
    console.error('[journey] add exam error:', error);
    res.status(500).json({ message: 'Failed to add the exam' });
  }
};

// DELETE /api/journey/exams/:id
exports.removeExam = async (req, res) => {
  try {
    const { profile, plan } = await loadJourney(req);
    if (!profile || !plan) return res.status(404).json({ message: 'Journey not set up' });
    if (!removeExam(profile, req.params.id)) return res.status(404).json({ message: 'Exam not found' });
    await profile.save();
    res.json({ success: true, journey: await serialize(profile, plan) });
  } catch (error) {
    console.error('[journey] remove exam error:', error);
    res.status(500).json({ message: 'Failed to remove the exam' });
  }
};

exports.demoEnabled = demoEnabled;
