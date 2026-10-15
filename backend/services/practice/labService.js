// Practice Lab: short question sets for any branch's subjects (numerical and
// multiple choice), graded on the server so answers never reach the browser early.

const { generateJson } = require('../aiJson');
const { subjectsFor, branchFamily } = require('../journey/templates');
const { skillKey } = require('../evidenceService');

const QUESTIONS_PER_SET = 5;
const APTITUDE = ['Quantitative aptitude', 'Logical reasoning'];
const DAY_MS = 24 * 60 * 60 * 1000;
const REVIEW_INTERVAL_DAYS = [3, 7, 21, 60];
const PASS_SCORE = 70;

/** Subjects offered to this student: their branch's core list plus aptitude. */
function labSubjects(profile) {
  const s = subjectsFor(profile.branch);
  const subjects = [...s.foundation, ...s.core, s.advanced];
  // Programming subjects are practised as DSA problems; keep the theory ones here
  const list = branchFamily(profile.branch) === 'software'
    ? subjects.filter((name) => !/data structures|programming fundamentals/i.test(name))
    : subjects;
  return [...new Set([...list, ...APTITUDE])];
}

function difficultyFor(profile, subject) {
  const skill = (profile.skills || []).find((sk) => sk.key === skillKey(subject));
  const level = skill ? skill.level : 0;
  if (!skill || level < 40) return 'easy';
  if (level < 70) return 'medium';
  return 'hard';
}

function normalizeQuestion(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const question = String(raw.question || '').trim();
  if (!question) return null;
  const base = {
    question: question.slice(0, 1200),
    explanation: String(raw.explanation || '').trim().slice(0, 1200),
    concept: String(raw.concept || '').trim().slice(0, 120),
  };

  if (raw.type === 'mcq') {
    const options = Array.isArray(raw.options) ? raw.options.map((o) => String(o).trim()).filter(Boolean) : [];
    const answerIndex = Number(raw.answerIndex);
    if (options.length !== 4 || !Number.isInteger(answerIndex) || answerIndex < 0 || answerIndex > 3) return null;
    if (new Set(options.map((o) => o.toLowerCase())).size !== 4) return null;
    return { ...base, type: 'mcq', options: options.map((o) => o.slice(0, 300)), answerIndex };
  }

  if (raw.type === 'numeric') {
    const answer = Number(raw.answer);
    if (!Number.isFinite(answer)) return null;
    const tolerancePct = Math.min(5, Math.max(0.5, Number(raw.tolerancePct) || 2));
    return { ...base, type: 'numeric', options: [], answer, tolerancePct, unit: String(raw.unit || '').slice(0, 30) };
  }
  return null;
}

/**
 * Ask the model for a question set. Throws when no usable set comes back, so
 * the caller can tell the student to try again.
 */
async function generateQuestions(profile, subject, difficulty, focusConcepts = []) {
  const focus = focusConcepts.length
    ? `The student recently got these concepts wrong; include at least two questions on them: ${focusConcepts.slice(0, 5).join('; ')}.`
    : '';

  const prompt = `Write a short practice set for an engineering student.

STUDENT: ${profile.degree} in ${profile.branch}, goal ${profile.goal && profile.goal.type ? profile.goal.type.replace('_', ' ') : 'undecided'}.
SUBJECT: ${subject}
DIFFICULTY: ${difficulty} (university exam and GATE / placement test style)
${focus}

Write exactly ${QUESTIONS_PER_SET} questions. Mix two kinds:
- "mcq": four options, exactly one correct, plausible distractors.
- "numeric": a calculation with a single numerical answer. Give the answer as a plain number and its unit.
Include at least two numeric questions when the subject involves calculation.
Check every answer carefully; a wrong answer key is worse than an easy question.
Write maths as plain text the page can show directly (sqrt(T1*T2), x^2, a/b), never LaTeX or backslashes.

Return JSON only:
{"questions": [
  {"type": "mcq", "question": "...", "options": ["...", "...", "...", "..."], "answerIndex": 0, "explanation": "why the answer is right, 1-3 sentences", "concept": "the concept tested, 2-5 words"},
  {"type": "numeric", "question": "...", "answer": 12.5, "unit": "kJ", "tolerancePct": 2, "explanation": "worked solution in 1-4 short steps", "concept": "..."}
]}`;

  const result = await generateJson(prompt);
  const questions = (Array.isArray(result.questions) ? result.questions : [])
    .map(normalizeQuestion)
    .filter(Boolean)
    .slice(0, QUESTIONS_PER_SET);

  if (questions.length < 3) {
    throw new Error('The question generator returned too few usable questions');
  }
  return questions;
}

/** Questions as the browser sees them before submitting: no answers. */
function publicQuestions(set) {
  return set.questions.map((q, index) => ({
    index,
    type: q.type,
    question: q.question,
    options: q.type === 'mcq' ? q.options : [],
    unit: q.unit || '',
  }));
}

function isCorrect(question, given) {
  if (given === null || given === undefined || given === '') return false;
  if (question.type === 'mcq') return Number(given) === question.answerIndex;
  const value = Number(given);
  if (!Number.isFinite(value)) return false;
  if (question.answer === 0) return Math.abs(value) <= 1e-6;
  return Math.abs(value - question.answer) <= (Math.abs(question.answer) * question.tolerancePct) / 100;
}

/** Mark a submission. Returns per-question results and a 0-100 score. */
function grade(set, answers) {
  const list = Array.isArray(answers) ? answers : [];
  const results = set.questions.map((q, index) => {
    const given = list[index];
    const correct = isCorrect(q, given);
    return {
      index,
      correct,
      given: given === undefined ? null : given,
      correctAnswer: q.type === 'mcq' ? q.answerIndex : q.answer,
      unit: q.unit || '',
      explanation: q.explanation,
      concept: q.concept,
    };
  });
  const score = Math.round((results.filter((r) => r.correct).length / set.questions.length) * 100);
  return { results, score };
}

/** Update a subject's review schedule after a set. Mutates `progress`. */
function applySetResult(progress, { score, missedConcepts, correctConcepts = [], now }) {
  const wasDue = progress.nextReviewAt && now >= new Date(progress.nextReviewAt);
  progress.sets = (progress.sets || 0) + 1;
  progress.lastScore = score;
  progress.bestScore = Math.max(progress.bestScore || 0, score);
  progress.lastPracticedAt = now;

  if (score >= PASS_SCORE) {
    progress.reviewStage = wasDue ? Math.min(3, (progress.reviewStage || 0) + 1) : progress.reviewStage || 0;
  } else {
    progress.reviewStage = 0;
  }
  progress.nextReviewAt = new Date(now.getTime() + REVIEW_INTERVAL_DAYS[progress.reviewStage] * DAY_MS);

  // Concepts answered correctly this time are no longer flagged
  const fixed = new Set(correctConcepts.map((c) => c.toLowerCase()));
  const merged = [...missedConcepts, ...(progress.missedConcepts || [])]
    .filter(Boolean)
    .filter((c) => !fixed.has(c.toLowerCase()) || missedConcepts.includes(c));
  progress.missedConcepts = [...new Set(merged)].slice(0, 8);
  return progress;
}

module.exports = {
  QUESTIONS_PER_SET,
  PASS_SCORE,
  labSubjects,
  difficultyFor,
  normalizeQuestion,
  generateQuestions,
  publicQuestions,
  isCorrect,
  grade,
  applySetResult,
};
