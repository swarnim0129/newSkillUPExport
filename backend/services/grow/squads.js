// Study squads: 2 to 4 students who keep a shared streak. A day counts for the
// squad only when every member did something on SkillUp that day.

const crypto = require('crypto');
const Squad = require('../../models/Squad');
const Candidate = require('../../models/Candidate');
const StudentEvent = require('../../models/StudentEvent');
const PracticeAttempt = require('../../models/PracticeAttempt');

const DAY_MS = 24 * 60 * 60 * 1000;
const OFFSET_MIN = 330; // Indian time; squads compare days on one clock
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

function dayKey(date) {
  return new Date(new Date(date).getTime() + OFFSET_MIN * 60000).toISOString().slice(0, 10);
}

function makeCode() {
  return Array.from(crypto.randomBytes(6), (b) => ALPHABET[b % ALPHABET.length]).join('');
}

async function createSquad(data) {
  for (let i = 0; i < 5; i++) {
    try {
      return await Squad.create({ ...data, code: makeCode() });
    } catch (err) {
      if (!(err && err.code === 11000)) throw err;
    }
  }
  throw new Error('Could not create a squad code');
}

/** Active days per member over the last `days` days. */
async function activity(memberIds, days = 30) {
  const since = new Date(Date.now() - days * DAY_MS);
  const [events, attempts] = await Promise.all([
    StudentEvent.find({ candidate: { $in: memberIds }, occurredAt: { $gte: since } }).select('candidate occurredAt').lean(),
    PracticeAttempt.find({ candidate: { $in: memberIds }, occurredAt: { $gte: since } }).select('candidate occurredAt').lean(),
  ]);
  const map = Object.fromEntries(memberIds.map((id) => [String(id), new Map()]));
  [...events, ...attempts].forEach((r) => {
    const m = map[String(r.candidate)];
    if (!m) return;
    const k = dayKey(r.occurredAt);
    m.set(k, (m.get(k) || 0) + 1);
  });
  return map;
}

function streakOf(isActive, today) {
  // A streak survives until the end of today, so not having worked yet today does not break it
  let streak = 0;
  let d = new Date(today);
  if (!isActive(dayKey(d))) d = new Date(d.getTime() - DAY_MS);
  while (isActive(dayKey(d))) {
    streak += 1;
    d = new Date(d.getTime() - DAY_MS);
  }
  return streak;
}

function displayName(c) {
  return `${c.firstName || ''} ${c.lastName || ''}`.trim() || 'Student';
}

async function describeSquad(squad, viewerId) {
  const members = await Candidate.find({ _id: { $in: squad.members } }).select('firstName lastName weeklyXp currentStreak').lean();
  const act = await activity(squad.members, 30);
  const now = new Date();
  const todayKey = dayKey(now);
  const allActive = (k) => squad.members.length > 0 && squad.members.every((m) => (act[String(m)] || new Map()).has(k));

  const last14 = [];
  for (let i = 13; i >= 0; i--) {
    const k = dayKey(new Date(now.getTime() - i * DAY_MS));
    last14.push({ day: k, all: allActive(k), active: squad.members.filter((m) => (act[String(m)] || new Map()).has(k)).length });
  }

  return {
    id: String(squad._id),
    name: squad.name,
    code: squad.code,
    focus: squad.focus,
    fromClass: !!squad.classroom,
    streak: streakOf(allActive, now),
    flameToday: allActive(todayKey),
    last14,
    members: members.map((c) => {
      const days = act[String(c._id)] || new Map();
      return {
        candidateId: String(c._id),
        name: displayName(c),
        me: String(c._id) === String(viewerId),
        activeToday: days.has(todayKey),
        streak: streakOf((k) => days.has(k), now),
        sessions14: [...days.entries()].filter(([k]) => k >= last14[0].day).reduce((a, [, n]) => a + n, 0),
        weeklyXp: c.weeklyXp || 0,
      };
    }),
  };
}

/** Mentor: pair strong with weak (snake order by readiness) into squads of `size`. */
function formGroups(rows, size) {
  const sorted = [...rows].sort((a, b) => b.readiness - a.readiness);
  const count = Math.max(1, Math.ceil(sorted.length / size));
  const groups = Array.from({ length: count }, () => []);
  sorted.forEach((row, i) => {
    const round = Math.floor(i / count);
    const idx = round % 2 === 0 ? i % count : count - 1 - (i % count);
    groups[idx].push(row);
  });
  // Nobody is left alone: a single student joins the smallest other squad
  const full = groups.filter((g) => g.length >= 2);
  groups.filter((g) => g.length === 1).forEach((g) => {
    const target = [...full].sort((x, y) => x.length - y.length)[0];
    if (target) target.push(...g);
  });
  return full;
}

module.exports = { createSquad, describeSquad, activity, formGroups, dayKey, displayName };
