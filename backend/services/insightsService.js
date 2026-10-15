// Student insights: the what-if time machine, the rival ghost, the burnout
// guard and the mistake fingerprint. Rule-based on purpose: every number shown
// can be traced to the student's own records and the assumptions listed.

const StudentProfile = require('../models/StudentProfile');
const StudentEvent = require('../models/StudentEvent');
const PracticeAttempt = require('../models/PracticeAttempt');
const PracticeProgress = require('../models/PracticeProgress');
const { readiness, targetFor, weeklyPace, READY_LEVEL } = require('./journey/forecastService');
const { patternOverview } = require('./practice/masteryService');
const { MISTAKE_LABELS } = require('./practice/coachService');
const { branchFamily } = require('./journey/templates');
const { applyOps, logChange, isOpen } = require('./journey/planService');
const { journeyNow, currentSemester, DAY_MS } = require('./journey/clock');

const WEEK_MS = 7 * DAY_MS;
const GOALS = ['placement', 'higher_studies', 'govt_exam', 'startup', 'undecided'];
// Readiness points gained per week for each weekly hour, when there is no history to measure it
const DEFAULT_POINTS_PER_HOUR = 0.06;
// One fully solved DSA problem lifts the 15-pattern average by about this much
const DSA_POINTS_PER_PROBLEM = 100 / 45;

function clamp(value, lo, hi) {
  return Math.max(lo, Math.min(hi, value));
}

/** A copy of the profile that calculations may change without touching the saved one. */
function sandbox(profile) {
  const plain = typeof profile.toObject === 'function' ? profile.toObject() : { ...profile };
  return { ...plain, goal: { ...(plain.goal || {}) }, readinessHistory: [...(plain.readinessHistory || [])] };
}

async function dsaLevelsFor(candidateId, now) {
  const progress = await PracticeProgress.find({ candidate: candidateId }).lean();
  return patternOverview(progress, now);
}

// ─── What-if time machine ───────────────────────────────────────────────────

/**
 * Project readiness week by week for the current habits and for a changed
 * scenario. Gains slow down near the top (the last points are the hardest).
 */
function project(start, pointsPerWeek, weeks, boost = 0, boostWeeks = 0) {
  const series = [start];
  let value = start;
  for (let w = 1; w <= weeks; w++) {
    // Extra DSA practice only helps until every problem in the bank is solved
    const pace = pointsPerWeek + (w <= boostWeeks ? boost : 0);
    value = clamp(value + pace * (1 - value / 120), 0, 100);
    series.push(Math.round(value * 10) / 10);
  }
  return series;
}

function firstReady(series) {
  const i = series.findIndex((v) => v >= READY_LEVEL);
  return i === -1 ? null : i;
}

async function whatIf(profile, plan, scenario = {}) {
  const now = journeyNow(profile);
  const overview = await dsaLevelsFor(profile.candidate, now);
  const current = sandbox(profile);

  const hoursNow = profile.hoursPerWeek || 8;
  const measuredPace = weeklyPace(current.readinessHistory, now);
  const perHour = measuredPace !== null && measuredPace > 0 ? measuredPace / hoursNow : DEFAULT_POINTS_PER_HOUR;
  const basePace = measuredPace !== null ? measuredPace : perHour * hoursNow;

  const hours = clamp(Math.round(Number(scenario.hoursPerWeek) || hoursNow), 1, 60);
  const goal = GOALS.includes(scenario.goal) ? scenario.goal : current.goal.type || 'undecided';
  const dsaPerWeek = clamp(Math.round(Number(scenario.dsaPerWeek) || 0), 0, 30);

  const baseToday = readiness(current, plan, overview.levels);
  const changed = sandbox(profile);
  changed.goal.type = goal;
  const changedToday = readiness(changed, plan, overview.levels);
  const dsaPart = changedToday.parts.find((p) => /DSA|Exam subjects/i.test(p.name));
  const dsaWeight = dsaPart ? dsaPart.weight : 0;
  // Retention: about 70% of new problem credit survives the forgetting curve
  const dsaBoost = dsaPerWeek * DSA_POINTS_PER_PROBLEM * dsaWeight * 0.7;
  const solved = overview.patterns.reduce((sum, p) => sum + p.solved, 0);
  const remaining = Math.max(0, overview.patterns.reduce((sum, p) => sum + p.problems.length, 0) - solved);
  const boostWeeks = dsaPerWeek ? Math.floor(remaining / dsaPerWeek) : 0;
  const hoursPace = perHour * hours;
  const scenarioPace = hoursPace + (boostWeeks ? dsaBoost : 0);

  const target = targetFor(changed, now);
  const baseTarget = targetFor(current, now);
  const weeks = clamp(Math.ceil((Math.max(new Date(target.date), new Date(baseTarget.date)) - now) / WEEK_MS), 4, 156);

  const baseline = project(baseToday.value, basePace, weeks);
  const scenarioSeries = project(changedToday.value, hoursPace, weeks, dsaBoost, boostWeeks);
  const points = baseline.map((value, week) => ({
    week,
    date: new Date(now.getTime() + week * WEEK_MS),
    baseline: Math.round(value),
    scenario: Math.round(scenarioSeries[week]),
  }));

  const weekAt = (date) => clamp(Math.round((new Date(date) - now) / WEEK_MS), 0, weeks);
  const baseReady = firstReady(baseline);
  const scenReady = firstReady(scenarioSeries);
  const atTarget = { baseline: Math.round(baseline[weekAt(baseTarget.date)]), scenario: Math.round(scenarioSeries[weekAt(target.date)]) };

  let verdict;
  if (scenReady === null && baseReady === null) {
    verdict = `Neither path reaches ${READY_LEVEL} in the next ${Math.round(weeks / 4.3)} months. Try more hours or a few DSA problems a week.`;
  } else if (scenReady !== null && (baseReady === null || scenReady < baseReady)) {
    const gain = baseReady === null ? null : baseReady - scenReady;
    verdict = gain === null
      ? `This change gets you to ${READY_LEVEL} in ${scenReady} weeks. Your current habits never get there in this window.`
      : `This change gets you ready ${gain} week${gain === 1 ? '' : 's'} sooner (${scenReady} weeks instead of ${baseReady}).`;
  } else if (scenReady !== null && baseReady !== null && scenReady > baseReady) {
    verdict = `This change makes you ready ${scenReady - baseReady} weeks later than your current habits.`;
  } else {
    verdict = `Both paths reach ${READY_LEVEL} at about the same time.`;
  }

  return {
    readyLevel: READY_LEVEL,
    now,
    current: { hoursPerWeek: hoursNow, goal: current.goal.type || 'undecided', readiness: baseToday.value, pointsPerWeek: Math.round(basePace * 10) / 10 },
    scenario: { hoursPerWeek: hours, goal, dsaPerWeek, readiness: changedToday.value, pointsPerWeek: Math.round(scenarioPace * 10) / 10 },
    target: { date: target.date, label: target.label, week: weekAt(target.date) },
    readyWeek: { baseline: baseReady, scenario: scenReady },
    readyDate: {
      baseline: baseReady === null ? null : new Date(now.getTime() + baseReady * WEEK_MS),
      scenario: scenReady === null ? null : new Date(now.getTime() + scenReady * WEEK_MS),
    },
    atTarget,
    verdict,
    parts: changedToday.parts,
    points,
    assumptions: [
      measuredPace !== null
        ? `Your pace is measured from your last 8 weeks: ${Math.round(basePace * 10) / 10} points a week at ${hoursNow} hours.`
        : `Not enough history yet, so pace is estimated at ${DEFAULT_POINTS_PER_HOUR} points a week per weekly hour.`,
      'Pace grows in proportion to hours; gains slow down near 100.',
      dsaPerWeek ? `${remaining} problems are left in the bank, so the extra DSA practice helps for ${boostWeeks} weeks. Each one solved adds about ${(DSA_POINTS_PER_PROBLEM * 0.7).toFixed(1)} to the DSA average after forgetting, weighted ${Math.round(dsaWeight * 100)}% in readiness for this goal.` : 'Extra DSA problems a week: none in this scenario.',
      goal !== (current.goal.type || 'undecided') ? `A different goal changes how readiness is weighted, so today's score changes from ${baseToday.value} to ${changedToday.value}.` : 'Same goal as now.',
    ],
  };
}

// ─── Rival ghost ────────────────────────────────────────────────────────────

function semesterAverages(profile, history) {
  const bySem = {};
  (history || []).forEach((h) => {
    const sem = currentSemester(profile, new Date(h.at));
    (bySem[sem] = bySem[sem] || []).push(h.value);
  });
  const out = {};
  Object.entries(bySem).forEach(([sem, values]) => {
    out[sem] = Math.round(values.reduce((a, b) => a + b, 0) / values.length);
  });
  return out;
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

/** Semester by which the goal is judged (placement season, exam season, graduation). */
function targetSemester(goal) {
  if (goal === 'placement') return 7;
  return 8;
}

async function rival(profile, plan) {
  const now = journeyNow(profile);
  const semester = currentSemester(profile, now);
  const goal = (profile.goal && profile.goal.type) || 'undecided';
  const family = branchFamily(profile.branch);
  const overview = await dsaLevelsFor(profile.candidate, now);
  const today = readiness(sandbox(profile), plan, overview.levels);

  // Real seniors: same goal and branch family, who have reached the ready level at some point
  const others = await StudentProfile.find({ candidate: { $ne: profile.candidate }, 'goal.type': goal })
    .select('candidate branch semesterAtSetup setupAt readinessHistory clockOffsetDays')
    .lean();
  const achievers = others.filter((o) => branchFamily(o.branch) === family && (o.readinessHistory || []).some((h) => h.value >= READY_LEVEL));
  const peerSeries = achievers.map((o) => semesterAverages(o, o.readinessHistory));

  const ghost = {};
  let source;
  if (peerSeries.length >= 2) {
    source = 'peers';
    for (let s = 1; s <= 8; s++) {
      const m = median(peerSeries.map((p) => p[s]).filter((v) => typeof v === 'number'));
      if (m !== null) ghost[s] = m;
    }
  }
  // Fill the gaps (or everything) with the benchmark: steady growth that reaches the ready level on time
  const reachBy = targetSemester(goal);
  for (let s = 1; s <= 8; s++) {
    if (ghost[s] === undefined) ghost[s] = Math.round(s <= reachBy ? 8 + ((READY_LEVEL + 5 - 8) * (s - 1)) / Math.max(1, reachBy - 1) : READY_LEVEL + 5 + (s - reachBy) * 3);
  }
  if (!source) source = 'benchmark';

  const mine = semesterAverages(profile, profile.readinessHistory);
  mine[semester] = today.value;

  const series = [];
  for (let s = 1; s <= 8; s++) {
    series.push({ semester: s, ghost: ghost[s], you: s <= semester ? (mine[s] ?? null) : null });
  }

  // Benchmarks for this semester, scaled to where the ghost should be by now
  const share = clamp((semester - 1) / Math.max(1, reachBy - 1), 0, 1);
  const counted = plan.milestones.filter((m) => m.status !== 'skipped');
  const doneNow = counted.filter((m) => m.status === 'done').length;
  const dueByNow = counted.filter((m) => m.semester < semester || (m.semester === semester && new Date(m.dueAt) <= now)).length;
  const [interviews, mastered] = [
    await StudentEvent.countDocuments({ candidate: profile.candidate, type: 'interview_completed' }),
    overview.patterns.filter((p) => p.status === 'mastered').length,
  ];
  const isSoftware = family === 'software';
  const compare = [
    { label: 'Readiness', you: today.value, ghost: ghost[semester], unit: '/100' },
    { label: 'Plan milestones done', you: doneNow, ghost: Math.max(doneNow, dueByNow), unit: '' },
  ];
  if (isSoftware || goal === 'placement') compare.push({ label: 'DSA patterns mastered', you: mastered, ghost: Math.round(15 * share * 0.8), unit: '/15' });
  if (goal === 'placement') compare.push({ label: 'Mock interviews done', you: interviews, ghost: Math.max(0, Math.round((semester - 4) * 2)), unit: '' });

  const gap = today.value - ghost[semester];
  const ahead = compare.filter((c) => c.you >= c.ghost).length;
  const message = gap >= 0
    ? `You are ${gap} points ahead of the ghost in semester ${semester}. Keep the lead.`
    : `The ghost is ${-gap} points ahead in semester ${semester}. Close it with ${Math.ceil(-gap / Math.max(1, 3))} weeks of focused practice.`;

  return {
    semester,
    goal,
    source,
    peers: peerSeries.length,
    ghostName: source === 'peers' ? `Ghost of ${peerSeries.length} seniors who got ready` : 'Benchmark ghost',
    explanation: source === 'peers'
      ? `Built from ${peerSeries.length} anonymous students with your goal and branch family who reached ${READY_LEVEL}. Shows their median readiness each semester.`
      : `Not enough seniors with your goal yet, so the ghost follows the steady path that reaches ${READY_LEVEL} by semester ${reachBy}.`,
    series,
    compare,
    ahead,
    message,
  };
}

// ─── Burnout guard ──────────────────────────────────────────────────────────

const LATE_START = 0; // 00:00
const LATE_END = 5; // until 04:59

async function wellbeing(profile, plan) {
  const now = journeyNow(profile);
  const since = new Date(now.getTime() - 14 * DAY_MS);
  const offset = (profile.wellbeing && profile.wellbeing.tzOffsetMinutes) ?? 330;

  const [events, attempts] = await Promise.all([
    StudentEvent.find({ candidate: profile.candidate, occurredAt: { $gte: since } }).select('occurredAt score type').lean(),
    PracticeAttempt.find({ candidate: profile.candidate, occurredAt: { $gte: since } }).select('occurredAt passed').sort({ occurredAt: 1 }).lean(),
  ]);
  const stamps = [...events.map((e) => e.occurredAt), ...attempts.map((a) => a.occurredAt)].map((d) => new Date(d));
  const local = (d) => new Date(d.getTime() + offset * 60000);
  const lateNight = stamps.filter((d) => { const h = local(d).getUTCHours(); return h >= LATE_START && h < LATE_END; }).length;
  const days = new Set(stamps.map((d) => local(d).toISOString().slice(0, 10)));
  const thisWeek = stamps.filter((d) => d >= new Date(now.getTime() - 7 * DAY_MS)).length;
  const lastWeek = stamps.length - thisWeek;

  const recent = attempts.slice(-8);
  const earlier = attempts.slice(-16, -8);
  const rate = (list) => (list.length ? list.filter((a) => a.passed).length / list.length : null);
  const passNow = rate(recent);
  const passBefore = rate(earlier);
  const overdue = plan.milestones.filter((m) => isOpen(m) && new Date(m.dueAt) < now).length;

  const signals = [];
  let load = 0;
  if (stamps.length && lateNight / stamps.length >= 0.3) {
    load += 30;
    signals.push({ code: 'late_nights', label: `${Math.round((100 * lateNight) / stamps.length)}% of your work in the last two weeks was between midnight and 5 am.` });
  }
  if (days.size >= 13 && stamps.length >= 40) {
    load += 20;
    signals.push({ code: 'no_rest', label: `Active ${days.size} of the last 14 days with no rest day.` });
  }
  if (lastWeek >= 5 && thisWeek >= lastWeek * 2) {
    load += 20;
    signals.push({ code: 'spike', label: `Twice as much work this week as last (${thisWeek} vs ${lastWeek} sessions).` });
  }
  if (passNow !== null && passBefore !== null && recent.length >= 6 && passNow + 0.25 <= passBefore) {
    load += 20;
    signals.push({ code: 'falling', label: `Practice pass rate fell from ${Math.round(passBefore * 100)}% to ${Math.round(passNow * 100)}% while you kept going.` });
  }
  if (overdue >= 4) {
    load += 15;
    signals.push({ code: 'overdue', label: `${overdue} milestones are past due, which adds pressure.` });
  }
  load = clamp(load, 0, 100);
  const level = load >= 50 ? 'overloaded' : load >= 25 ? 'stretched' : 'steady';

  // Last 14 days, per day, for the chart
  const daily = [];
  for (let i = 13; i >= 0; i--) {
    const day = local(new Date(now.getTime() - i * DAY_MS)).toISOString().slice(0, 10);
    const dayStamps = stamps.filter((d) => local(d).toISOString().slice(0, 10) === day);
    daily.push({
      day,
      sessions: dayStamps.length,
      late: dayStamps.filter((d) => { const h = local(d).getUTCHours(); return h >= LATE_START && h < LATE_END; }).length,
    });
  }

  const easeable = plan.milestones.filter((m) => isOpen(m) && m.origin !== 'mentor' && new Date(m.dueAt) < new Date(now.getTime() + 14 * DAY_MS));
  return {
    settings: {
      optIn: !!(profile.wellbeing && profile.wellbeing.optIn),
      shareWithMentor: !!(profile.wellbeing && profile.wellbeing.shareWithMentor),
      lastEasedAt: profile.wellbeing && profile.wellbeing.lastEasedAt,
    },
    load,
    level,
    signals,
    daily,
    restDays: 14 - days.size,
    canEase: easeable.length,
    advice: level === 'overloaded'
      ? 'Take a rest day, sleep before midnight, and let me push non-urgent work back a week.'
      : level === 'stretched'
        ? 'You are pushing hard. Plan one lighter day this week and keep sessions before midnight.'
        : 'Your load looks sustainable. Keep a rest day each week.',
  };
}

/** Push open, non-class milestones due in the next two weeks back by a week. */
function easePlan(profile, plan) {
  const now = journeyNow(profile);
  const soon = plan.milestones
    .filter((m) => isOpen(m) && m.origin !== 'mentor' && new Date(m.dueAt) < new Date(now.getTime() + 14 * DAY_MS))
    .sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt));
  const ops = soon.map((m) => {
    const days = Math.max(7, Math.round((new Date(m.dueAt) - now) / DAY_MS) + 7);
    return { op: 'move', ref: m._id, dueInDays: days, reason: 'Eased by the burnout guard so you can rest.' };
  });
  const changes = applyOps(profile, plan, ops, now);
  if (changes.length) {
    logChange(plan, 'manual', `Burnout guard eased the next two weeks: ${changes.length} milestone${changes.length > 1 ? 's' : ''} moved back a week.`, changes, now);
  }
  return changes;
}

/** For a mentor: only students who opted in and chose to share. */
async function overloadFlag(profile, plan) {
  if (!(profile.wellbeing && profile.wellbeing.optIn && profile.wellbeing.shareWithMentor)) return null;
  const w = await wellbeing(profile, plan);
  return w.level === 'overloaded' ? { code: 'overloaded', label: 'Burnout guard: looks overloaded (shared by the student)' } : null;
}

// ─── Mistake DNA ────────────────────────────────────────────────────────────

const DNA_TYPES = Object.keys(MISTAKE_LABELS).filter((t) => t !== 'syntax_error');

function shares(list) {
  const counts = Object.fromEntries(DNA_TYPES.map((t) => [t, 0]));
  list.forEach((a) => { if (counts[a] !== undefined) counts[a] += 1; });
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  return { counts, total };
}

async function mistakeDna(candidateIds, now = new Date()) {
  const ids = Array.isArray(candidateIds) ? candidateIds : [candidateIds];
  const since = new Date(now.getTime() - 180 * DAY_MS);
  const failed = await PracticeAttempt.find({ candidate: { $in: ids }, passed: false, 'mistake.type': { $exists: true }, occurredAt: { $gte: since } })
    .select('mistake.type occurredAt kind')
    .lean();

  const recentCut = new Date(now.getTime() - 30 * DAY_MS);
  const prevCut = new Date(now.getTime() - 60 * DAY_MS);
  const recent = shares(failed.filter((a) => new Date(a.occurredAt) >= recentCut).map((a) => a.mistake.type));
  const before = shares(failed.filter((a) => new Date(a.occurredAt) >= prevCut && new Date(a.occurredAt) < recentCut).map((a) => a.mistake.type));
  const all = shares(failed.map((a) => a.mistake.type));

  const pct = (s, t) => (s.total ? Math.round((100 * s.counts[t]) / s.total) : 0);
  const axes = DNA_TYPES.map((t) => ({ type: t, label: MISTAKE_LABELS[t], recent: pct(recent, t), before: pct(before, t), allTime: pct(all, t), count: all.counts[t] }));

  // Monthly counts for the last six months
  const months = [];
  for (let i = 5; i >= 0; i--) {
    const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
    const inMonth = failed.filter((a) => new Date(a.occurredAt) >= start && new Date(a.occurredAt) < end);
    const row = { month: start.toLocaleString('en-GB', { month: 'short' }) };
    DNA_TYPES.forEach((t) => { row[t] = inMonth.filter((a) => a.mistake.type === t).length; });
    months.push(row);
  }

  const shifts = [];
  if (recent.total >= 3 && before.total >= 3) {
    axes.forEach((a) => {
      const beforeCount = before.counts[a.type];
      const recentCount = recent.counts[a.type];
      if (beforeCount >= 2 && recentCount <= beforeCount * 0.5) {
        shifts.push({ tone: 'good', text: `${a.label} mistakes down ${Math.round(100 - (100 * recentCount) / beforeCount)}% this month.` });
      } else if (recentCount >= 3 && recentCount >= beforeCount * 2) {
        shifts.push({ tone: 'warn', text: `${a.label} mistakes up from ${beforeCount} to ${recentCount} this month.` });
      }
    });
  }
  const dominant = [...axes].sort((a, b) => b.allTime - a.allTime)[0];

  return {
    total: all.total,
    recentTotal: recent.total,
    axes,
    months,
    types: DNA_TYPES.map((t) => ({ type: t, label: MISTAKE_LABELS[t] })),
    dominant: dominant && dominant.allTime > 0 ? { type: dominant.type, label: dominant.label, share: dominant.allTime } : null,
    shifts: shifts.slice(0, 4),
  };
}

module.exports = { whatIf, rival, wellbeing, easePlan, overloadFlag, mistakeDna, sandbox };
