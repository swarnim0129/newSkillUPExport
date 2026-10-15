// Readiness forecast: how prepared the student is for their goal today, how fast
// that is rising, and where it will be by the deadline at the current pace.
//
// Readiness is a weighted average of measured levels, chosen by goal. Every
// part is shown to the student, so the number can always be explained.

const { skillKey } = require('../evidenceService');
const { subjectsFor, branchFamily } = require('./templates');
const { PATTERNS } = require('../../data/dsa/patterns');
const { journeyNow, currentSemester, semesterStart, addMonths, DAY_MS } = require('./clock');

const READY_LEVEL = 75;
const HISTORY_DAYS = 56;
const MIN_HISTORY_POINTS = 3;
const MIN_HISTORY_SPAN_DAYS = 7;
const MAX_HISTORY_POINTS = 240;
// A straight line drawn years ahead says nothing useful; project at most a year
const MAX_PROJECTION_WEEKS = 52;

function isSoftwareCareer(profile) {
  const role = (profile.goal && profile.goal.targetRole) || '';
  return branchFamily(profile.branch) === 'software' || /software|developer|sde|programmer|data scien/i.test(role);
}

function skillLevel(profile, name) {
  const skill = (profile.skills || []).find((s) => s.key === skillKey(name));
  return skill ? skill.level : 0;
}

function average(values) {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

/** The date the goal is judged by, and what to call it. */
function targetFor(profile, now) {
  const goal = (profile.goal && profile.goal.type) || 'undecided';
  if (goal === 'placement') {
    const season = semesterStart(profile, 7);
    if (now < season) return { date: season, label: 'placement season (start of semester 7)' };
    return { date: addMonths(semesterStart(profile, 8), 3), label: 'end of placement season' };
  }
  if (goal === 'higher_studies' || goal === 'govt_exam') {
    const exam = addMonths(semesterStart(profile, 8), 1);
    if (now < exam) return { date: exam, label: goal === 'higher_studies' ? 'entrance exam (early final semester)' : 'exam season (final semester)' };
    return { date: addMonths(semesterStart(profile, 8), 5), label: 'later exam window' };
  }
  return { date: addMonths(semesterStart(profile, 8), 6), label: 'graduation' };
}

/**
 * Today's readiness and its parts.
 * `dsaLevels` maps pattern key to level (from the practice records).
 */
function readiness(profile, plan, dsaLevels = {}) {
  const goal = (profile.goal && profile.goal.type) || 'undecided';
  const s = subjectsFor(profile.branch);
  const subjects = [...s.foundation, ...s.core];
  const dsa = average(PATTERNS.map((p) => dsaLevels[p.key] || 0));
  const subjectAvg = average(subjects.map((name) => skillLevel(profile, name)));
  const parts = [];

  if (goal === 'placement' && isSoftwareCareer(profile)) {
    parts.push({ name: 'DSA patterns (average of 15)', weight: 0.6, value: dsa });
    parts.push({ name: 'Mock interviews', weight: 0.2, value: skillLevel(profile, 'Interviewing') });
    parts.push({ name: 'Resume score', weight: 0.2, value: skillLevel(profile, 'Resume') });
  } else if (goal === 'placement') {
    parts.push({ name: `Core subjects of ${profile.branch}`, weight: 0.5, value: subjectAvg });
    parts.push({ name: 'Aptitude', weight: 0.1, value: skillLevel(profile, 'Quantitative aptitude') });
    parts.push({ name: 'Mock interviews', weight: 0.2, value: skillLevel(profile, 'Interviewing') });
    parts.push({ name: 'Resume score', weight: 0.2, value: skillLevel(profile, 'Resume') });
  } else if (goal === 'higher_studies' || goal === 'govt_exam') {
    const examSubjects = [...subjects, s.advanced];
    const values = examSubjects.map((name) => (
      /data structures/i.test(name) ? Math.max(skillLevel(profile, name), dsa) : skillLevel(profile, name)
    ));
    parts.push({ name: 'Exam subjects', weight: 0.8, value: average(values) });
    parts.push({ name: 'Aptitude', weight: 0.2, value: skillLevel(profile, 'Quantitative aptitude') });
  } else {
    const counted = plan.milestones.filter((m) => m.status !== 'skipped');
    const done = counted.length ? (100 * counted.filter((m) => m.status === 'done').length) / counted.length : 0;
    const tested = (profile.skills || []).filter((sk) => sk.evidenceCount > 0).map((sk) => sk.level);
    parts.push({ name: 'Plan completed', weight: 0.5, value: done });
    parts.push({ name: 'Measured skills', weight: 0.5, value: average(tested) });
  }

  const value = Math.round(parts.reduce((sum, p) => sum + p.weight * p.value, 0));
  return { value, parts: parts.map((p) => ({ ...p, value: Math.round(p.value) })) };
}

/** Keep one reading per day of the journey clock. Mutates `profile`. */
function recordReading(profile, value, now) {
  const day = new Date(now).toISOString().slice(0, 10);
  const history = profile.readinessHistory || [];
  const last = history[history.length - 1];
  if (last && new Date(last.at).toISOString().slice(0, 10) === day) {
    if (last.value === value) return false;
    last.value = value;
  } else {
    history.push({ at: now, value });
  }
  if (history.length > MAX_HISTORY_POINTS) history.splice(0, history.length - MAX_HISTORY_POINTS);
  profile.readinessHistory = history;
  return true;
}

/**
 * Points gained per week, from a least-squares line through the recent readings.
 * Null when there is not enough history to say.
 */
function weeklyPace(history, now) {
  const since = now.getTime() - HISTORY_DAYS * DAY_MS;
  const points = (history || [])
    .filter((h) => new Date(h.at).getTime() >= since)
    .map((h) => ({ x: (new Date(h.at).getTime() - since) / (7 * DAY_MS), y: h.value }));
  if (points.length < MIN_HISTORY_POINTS) return null;
  const spanDays = ((points[points.length - 1].x - points[0].x) * 7);
  if (spanDays < MIN_HISTORY_SPAN_DAYS) return null;

  const mx = average(points.map((p) => p.x));
  const my = average(points.map((p) => p.y));
  const sxx = points.reduce((sum, p) => sum + (p.x - mx) ** 2, 0);
  if (sxx === 0) return null;
  const sxy = points.reduce((sum, p) => sum + (p.x - mx) * (p.y - my), 0);
  return Math.round((sxy / sxx) * 10) / 10;
}

/**
 * Full forecast for the student. Records today's reading on the profile (the
 * caller saves it).
 */
function forecast(profile, plan, dsaLevels, now = journeyNow(profile)) {
  const today = readiness(profile, plan, dsaLevels);
  recordReading(profile, today.value, now);

  const target = targetFor(profile, now);
  const weeksLeft = Math.max(0, (new Date(target.date) - now) / (7 * DAY_MS));
  const pace = weeklyPace(profile.readinessHistory, now);

  let projected = null;
  let extraHoursPerWeek = null;
  let verdict;

  const horizonWeeks = Math.min(weeksLeft, MAX_PROJECTION_WEEKS);
  const capped = weeksLeft > MAX_PROJECTION_WEEKS;
  const when = capped ? 'a year from now' : target.label;

  if (pace === null) {
    verdict = 'Not enough history yet. Keep practising for a week or two and the forecast will appear.';
  } else {
    projected = Math.max(0, Math.min(100, Math.round(today.value + pace * horizonWeeks)));
    const needed = weeksLeft > 0 ? (READY_LEVEL - today.value) / weeksLeft : Infinity;
    if (today.value >= READY_LEVEL) {
      verdict = 'You are already at the ready level. Keep reviewing so it does not fade.';
      extraHoursPerWeek = 0;
    } else if (pace > 0 && needed <= pace) {
      verdict = `On track: at this pace you reach ${projected} by ${when}${capped ? `, with ${Math.round(weeksLeft)} weeks to go until ${target.label}` : ''}.`;
      extraHoursPerWeek = 0;
    } else if (pace > 0) {
      // Assume pace grows in proportion to the hours put in
      extraHoursPerWeek = Math.min(40, Math.ceil(profile.hoursPerWeek * (needed / pace - 1)));
      verdict = `Behind: at this pace you reach ${projected} by ${when}. About ${extraHoursPerWeek} more hours a week would reach ${READY_LEVEL} by ${target.label}.`;
    } else {
      verdict = `Readiness is flat or falling. Reviews are due or practice has stopped; at this rate you will not reach ${READY_LEVEL} by ${target.label}.`;
    }
  }

  const history = (profile.readinessHistory || []).map((h) => ({ at: h.at, value: h.value }));
  return {
    readyLevel: READY_LEVEL,
    now: today.value,
    parts: today.parts,
    target: { date: target.date, label: target.label, weeksLeft: Math.round(weeksLeft) },
    // The date the projection is for: the target, or one year ahead if the target is further
    projectedAt: new Date(now.getTime() + horizonWeeks * 7 * DAY_MS),
    pace,
    projected,
    extraHoursPerWeek,
    verdict,
    history,
    semester: currentSemester(profile, now),
  };
}

module.exports = { READY_LEVEL, isSoftwareCareer, targetFor, readiness, recordReading, weeklyPace, forecast };
