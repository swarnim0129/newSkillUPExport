// Faculty mentor view: a summary and risk flags for each student who joined
// one of the mentor's classes.

const crypto = require('crypto');
const Candidate = require('../models/Candidate');
const StudentProfile = require('../models/StudentProfile');
const JourneyPlan = require('../models/JourneyPlan');
const StudentEvent = require('../models/StudentEvent');
const PracticeProgress = require('../models/PracticeProgress');
const PracticeAttempt = require('../models/PracticeAttempt');
const { forecast } = require('./journey/forecastService');
const { patternOverview } = require('./practice/masteryService');
const { MISTAKE_LABELS } = require('./practice/coachService');
const { isOpen } = require('./journey/planService');
const { journeyNow, currentSemester, yearOfSemester, stageFor, DAY_MS } = require('./journey/clock');

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const INACTIVE_DAYS = 14;
const OVERDUE_LIMIT = 3;
const LOW_FORECAST = 60;
const REPEATED_MISTAKES = 3;
const LOW_SKILL = 40;

function makeMentorCode() {
  const bytes = crypto.randomBytes(6);
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}

function displayName(candidate) {
  const name = `${candidate.firstName || ''} ${candidate.lastName || ''}`.trim();
  return name || candidate.email || 'Student';
}

/**
 * Everything a mentor sees about one student, computed on the student's own
 * journey clock. Does not save anything.
 */
async function summarise(candidate, profile, plan) {
  const now = journeyNow(profile);
  const semester = currentSemester(profile, now);
  const year = yearOfSemester(semester);

  const [progress, lastEvent, lastAttempt, failed] = await Promise.all([
    PracticeProgress.find({ candidate: candidate._id }).lean(),
    StudentEvent.findOne({ candidate: candidate._id }).sort({ occurredAt: -1 }).select('occurredAt type topic').lean(),
    PracticeAttempt.findOne({ candidate: candidate._id }).sort({ occurredAt: -1 }).select('occurredAt').lean(),
    PracticeAttempt.find({ candidate: candidate._id, passed: false }).sort({ occurredAt: -1 }).limit(10).select('mistake.type').lean(),
  ]);

  const overview = patternOverview(progress, now);
  // Work on a copy so the mentor's view never changes the student's stored history
  const snapshot = {
    ...profile.toObject(),
    readinessHistory: (profile.readinessHistory || []).map((h) => ({ at: h.at, value: h.value })),
  };
  const fc = forecast(snapshot, plan, overview.levels, now);

  const open = plan.milestones.filter(isOpen);
  const overdue = open.filter((m) => new Date(m.dueAt) < now);
  const counted = plan.milestones.filter((m) => m.status !== 'skipped');
  const planPercent = counted.length ? Math.round((100 * counted.filter((m) => m.status === 'done').length) / counted.length) : 0;

  // Practice attempts count as activity even when they fail
  const lastActiveAt = [lastEvent && lastEvent.occurredAt, lastAttempt && lastAttempt.occurredAt, profile.setupAt]
    .filter(Boolean)
    .reduce((latest, d) => (new Date(d) > new Date(latest) ? d : latest));
  const daysInactive = Math.max(0, Math.floor((now - new Date(lastActiveAt)) / DAY_MS));

  const mistakeCounts = {};
  failed.forEach((a) => {
    const type = a.mistake && a.mistake.type;
    if (type && type !== 'syntax_error') mistakeCounts[type] = (mistakeCounts[type] || 0) + 1;
  });
  const topMistake = Object.entries(mistakeCounts).sort((a, b) => b[1] - a[1])[0] || null;

  const weakSkills = (profile.skills || [])
    .filter((s) => s.evidenceCount > 0 && s.level < LOW_SKILL)
    .sort((a, b) => a.level - b.level);

  // Each flag says what is wrong in words, so a mentor can act on it directly
  const flags = [];
  if (daysInactive >= INACTIVE_DAYS) flags.push({ code: 'inactive', label: `No activity for ${daysInactive} days` });
  if (overdue.length >= OVERDUE_LIMIT) flags.push({ code: 'overdue', label: `${overdue.length} milestones past due` });
  if (fc.projected !== null && fc.projected < LOW_FORECAST && fc.target.weeksLeft <= 52) {
    flags.push({ code: 'forecast', label: `Forecast ${fc.projected}/100 by ${fc.target.label}` });
  }
  if (topMistake && topMistake[1] >= REPEATED_MISTAKES) {
    flags.push({ code: 'mistakes', label: `Repeats "${MISTAKE_LABELS[topMistake[0]]}" (${topMistake[1]} times)` });
  }
  if (weakSkills.length) {
    flags.push({ code: 'low_scores', label: `Low tested score: ${weakSkills[0].name} ${weakSkills[0].level}/100` });
  }

  // Only when the student turned the burnout guard on and chose to share it
  const { overloadFlag } = require('./insightsService');
  const overload = await overloadFlag(profile, plan);
  if (overload) flags.push(overload);

  const risk = flags.length >= 2 ? 'high' : flags.length === 1 ? 'medium' : 'low';

  return {
    candidateId: String(candidate._id),
    name: displayName(candidate),
    email: candidate.email,
    branch: profile.branch,
    semester,
    year,
    stage: stageFor(year).name,
    goal: profile.goal,
    planPercent,
    overdue: overdue.length,
    nextMilestone: open.sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt))[0]?.title || null,
    lastActiveAt,
    daysInactive,
    readiness: fc.now,
    projected: fc.projected,
    target: fc.target,
    dsa: {
      mastered: overview.patterns.filter((p) => p.status === 'mastered').length,
      dueReviews: overview.patterns.reduce((sum, p) => sum + p.due, 0),
    },
    topMistake: topMistake ? { type: topMistake[0], label: MISTAKE_LABELS[topMistake[0]], count: topMistake[1] } : null,
    flags,
    risk,
  };
}

const RISK_ORDER = { high: 0, medium: 1, low: 2 };

/** Summaries for a list of students, highest risk first. Students without a journey are skipped. */
async function summariesFor(candidateIds) {
  const profiles = await StudentProfile.find({ candidate: { $in: candidateIds } });
  const summaries = await Promise.all(
    profiles.map(async (profile) => {
      const [candidate, plan] = await Promise.all([
        Candidate.findById(profile.candidate).lean(),
        JourneyPlan.findOne({ candidate: profile.candidate }),
      ]);
      if (!candidate || !plan) return null;
      return summarise(candidate, profile, plan);
    })
  );
  return summaries
    .filter(Boolean)
    .sort((a, b) => RISK_ORDER[a.risk] - RISK_ORDER[b.risk] || b.flags.length - a.flags.length || a.name.localeCompare(b.name));
}

module.exports = { makeMentorCode, summarise, summariesFor, displayName, RISK_ORDER };
