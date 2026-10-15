// Interview replay: colour each answer in a mock interview by how it came across.
// Computed from the transcript itself (words, fillers, hedges, length, response
// time), so it works without the AI; the AI only writes a better answer on request.

const { generateJson } = require('../aiJson');

const FILLERS = /\b(um+|uh+|erm|hmm+|like|basically|actually|you know|i mean|sort of|kind of|so yeah)\b/gi;
const HEDGES = /\b(i think|maybe|probably|i guess|not sure|i don't know|i dont know|perhaps|might be|kind of)\b/gi;
const STRUCTURE = /\b(first|second|third|then|finally|because|for example|for instance|so that|the reason|trade-?off|complexity|o\()/gi;

function count(text, re) {
  return (String(text).match(re) || []).length;
}

/** Tag one answer. Returns a tone for the heatmap and the reasons for it. */
function rateAnswer(text, responseSeconds) {
  const words = String(text).trim().split(/\s+/).filter(Boolean).length;
  const fillers = count(text, FILLERS);
  const hedges = count(text, HEDGES);
  const structure = count(text, STRUCTURE);
  const fillerRate = words ? fillers / words : 0;
  const reasons = [];
  let score = 70;

  if (words < 12) { score -= 25; reasons.push('Very short answer'); }
  else if (words > 220) { score -= 15; reasons.push('Long answer, may ramble'); }
  if (fillerRate > 0.06) { score -= 20; reasons.push(`${fillers} filler words`); }
  else if (fillers >= 3) { score -= 8; reasons.push(`${fillers} filler words`); }
  if (hedges >= 2) { score -= 12; reasons.push('Hedging ("I think", "maybe")'); }
  if (structure >= 2) { score += 15; reasons.push('Clear structure and reasons'); }
  if (typeof responseSeconds === 'number' && responseSeconds > 25) { score -= 8; reasons.push(`Took ${Math.round(responseSeconds)} s to start`); }
  score = Math.max(0, Math.min(100, score));

  const tone = score >= 75 ? 'confident' : score >= 55 ? 'okay' : words < 12 ? 'short' : fillerRate > 0.06 ? 'filler' : 'hesitant';
  return { score, tone, words, fillers, hedges, reasons: reasons.length ? reasons : ['Steady answer'] };
}

function analyse(interview) {
  const entries = interview.transcript || [];
  const turns = [];
  let lastQuestion = null;
  entries.forEach((e, i) => {
    if (e.role === 'assistant') { lastQuestion = { text: e.content, at: e.timestamp, index: i }; return; }
    const seconds = lastQuestion && lastQuestion.at && e.timestamp ? (new Date(e.timestamp) - new Date(lastQuestion.at)) / 1000 : null;
    const rating = rateAnswer(e.content, seconds !== null && seconds >= 0 && seconds < 600 ? seconds : null);
    turns.push({ index: turns.length, question: lastQuestion ? lastQuestion.text : '', answer: e.content, at: e.timestamp, ...rating });
  });

  const scores = turns.map((t) => t.score);
  const summary = {
    answers: turns.length,
    average: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null,
    confident: turns.filter((t) => t.tone === 'confident').length,
    fillers: turns.reduce((a, t) => a + t.fillers, 0),
    weakest: [...turns].sort((a, b) => a.score - b.score)[0] || null,
  };
  return { turns, summary };
}

async function betterAnswer(interview, turn) {
  const result = await generateJson(`A student practising for a ${interview.seniority} ${interview.role} interview (${interview.category}, topic ${interview.topic}) gave this answer.
QUESTION: ${String(turn.question).slice(0, 800)}
THEIR ANSWER: ${String(turn.answer).slice(0, 1500)}
Write a stronger answer they could say out loud in under 90 seconds, keeping their own facts where possible. Then list what changed.
Return JSON only: {"answer": "the improved answer, at most 140 words, plain text", "changes": ["2-4 short points, at most 15 words each"]}`, { timeoutMs: 30000 });
  return {
    answer: String(result.answer || '').trim().slice(0, 1200),
    changes: (Array.isArray(result.changes) ? result.changes : []).map((c) => String(c).slice(0, 160)).filter(Boolean).slice(0, 4),
  };
}

module.exports = { analyse, rateAnswer, betterAnswer };
