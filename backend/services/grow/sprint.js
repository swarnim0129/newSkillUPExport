// Panic mode: an hour-by-hour sprint to an exam that is hours or days away.
// The schedule is computed (weak topics first, spaced reviews, breaks, sleep);
// the AI only adds a short "what to cover" tip per topic when it is reachable.

const { generateJson } = require('../aiJson');

const MIN = 60000;
const DAY_START_HOUR = 8;
const DAY_END_HOUR = 23;

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

/** Local hour helpers that use the student's offset from UTC (minutes). */
function localParts(date, offset) {
  const d = new Date(date.getTime() + offset * MIN);
  return { hour: d.getUTCHours(), minute: d.getUTCMinutes(), dayKey: d.toISOString().slice(0, 10) };
}
function atLocal(dayKey, hour, offset) {
  return new Date(Date.parse(`${dayKey}T00:00:00Z`) + hour * 60 * MIN - offset * MIN);
}

function buildSchedule({ now, examAt, hoursPerDay, topics, offset }) {
  const blocks = [];
  // Weak topics get more passes; each pass is learn (or review) then practice
  const queue = [];
  const sorted = [...topics].sort((a, b) => a.confidence - b.confidence);
  const passes = { 1: 3, 2: 2, 3: 1 };
  for (let round = 0; round < 3; round++) {
    sorted.forEach((t) => { if (round < passes[t.confidence]) queue.push({ topic: t.name, round }); });
  }

  let cursor = new Date(Math.ceil((now.getTime() + 5 * MIN) / (15 * MIN)) * 15 * MIN);
  const stopAt = new Date(examAt.getTime() - 90 * MIN);
  let dayKey = null;
  let usedToday = 0;
  let sinceBreak = 0;
  const reviewed = [];
  let guard = 0;

  const push = (kind, minutes, title, topic = '') => {
    blocks.push({ startAt: new Date(cursor), minutes, kind, title, topic });
    cursor = new Date(cursor.getTime() + minutes * MIN);
  };

  while (queue.length && cursor < stopAt && guard++ < 400) {
    const p = localParts(cursor, offset);
    if (p.dayKey !== dayKey) { dayKey = p.dayKey; usedToday = 0; sinceBreak = 0; }
    if (p.hour < DAY_START_HOUR) { cursor = atLocal(p.dayKey, DAY_START_HOUR, offset); continue; }
    if (p.hour >= DAY_END_HOUR || usedToday >= hoursPerDay * 60) {
      // Sleep block until tomorrow morning
      const tomorrow = new Date(Date.parse(`${p.dayKey}T00:00:00Z`) + 24 * 60 * MIN).toISOString().slice(0, 10);
      const wake = atLocal(tomorrow, DAY_START_HOUR, offset);
      if (wake >= stopAt) break;
      if (p.hour >= 21) blocks.push({ startAt: new Date(cursor), minutes: 60, kind: 'sleep', title: 'Wind down and sleep. Memory consolidates overnight.', topic: '' });
      cursor = wake;
      continue;
    }
    if (sinceBreak >= 100) { push('break', 10, 'Break: water, walk, no phone'); sinceBreak = 0; continue; }

    const item = queue.shift();
    const learnMinutes = item.round === 0 ? 45 : 30;
    push(item.round === 0 ? 'learn' : 'review', learnMinutes, `${item.round === 0 ? 'Learn' : 'Review'}: ${item.topic}`, item.topic);
    push('practice', 20, `Quiz burst: ${item.topic}`, item.topic);
    usedToday += learnMinutes + 20;
    sinceBreak += learnMinutes + 20;
    reviewed.push(item.topic);
  }

  // Final mixed review right before the exam window, then rest
  if (cursor < stopAt) {
    const left = Math.round((stopAt - cursor) / MIN);
    if (left >= 30) push('review', Math.min(60, left), 'Final mixed review: formulas, definitions, past mistakes');
  }
  return { blocks: blocks.slice(0, 80), skipped: queue.map((q) => q.topic) };
}

async function topicTips(subject, topics) {
  try {
    const result = await generateJson(`A student has an exam in "${subject}" very soon. For each topic, write what to cover in one line (at most 20 words), focused on what exams ask most.
Topics: ${topics.map((t) => t.name).join('; ')}
Return JSON only: {"tips": [{"topic": "...", "tip": "..."}]}`, { timeoutMs: 20000 });
    const map = {};
    (Array.isArray(result.tips) ? result.tips : []).forEach((t) => {
      if (t && t.topic && t.tip) map[String(t.topic).toLowerCase()] = String(t.tip).slice(0, 300);
    });
    return map;
  } catch (err) {
    console.warn('[sprint] tips unavailable:', err.message);
    return null;
  }
}

function cleanTopics(list) {
  return (Array.isArray(list) ? list : [])
    .map((t) => ({ name: String((t && t.name) || t || '').trim().slice(0, 100), confidence: clamp(Math.round(Number(t && t.confidence) || 2), 1, 3) }))
    .filter((t) => t.name)
    .slice(0, 12);
}

module.exports = { buildSchedule, topicTips, cleanTopics };
