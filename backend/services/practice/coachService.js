// The DSA coach: hints that never hand over the answer, and a reading of why a
// failed submission failed. Both fall back to fixed text when the AI model is
// unavailable, so practice never stops working.

const PracticeAttempt = require('../../models/PracticeAttempt');
const { generateJson } = require('../aiJson');
const { patternName, problemsForPattern } = require('./dsaBank');

const MISTAKE_LABELS = {
  syntax_error: 'Code does not run',
  runtime_error: 'Crashes on some input',
  too_slow: 'Too slow on large input',
  edge_case: 'Missed an edge case',
  off_by_one: 'Off-by-one boundary',
  wrong_approach: 'Approach does not fit',
  logic_error: 'Logic mistake',
  concept_gap: 'Concept gap',
  calculation_error: 'Calculation slip',
};

// What a drill for each repeated mistake asks the student to do
const DRILL_ADVICE = {
  runtime_error: 'Before submitting, trace your code by hand on the smallest example and check every index and key you access.',
  too_slow: 'Write down the time complexity before coding, and look for the pattern that removes the inner loop.',
  edge_case: 'Before coding, list the edge cases (empty input, one element, all equal, negatives) and run each one.',
  off_by_one: 'Check every loop bound and every lo/hi update against a two-element example before submitting.',
  wrong_approach: 'Spend two minutes naming the pattern and why it fits before writing any code.',
  logic_error: 'Trace your code line by line on the failing example and compare with what you expected at each step.',
};

const HINT_LEVELS = {
  1: 'a nudge: one or two sentences, ideally a question, pointing at the key observation. Do not name the algorithm.',
  2: 'the approach: name the technique and describe the steps in plain words. No code and no pseudocode.',
  3: 'pseudocode: short numbered steps that are not Python. The student still has to write the code.',
};

const AI_TYPES = ['runtime_error', 'edge_case', 'off_by_one', 'wrong_approach', 'logic_error'];

function shortJson(value, max = 300) {
  let text;
  try {
    text = JSON.stringify(value);
  } catch {
    text = String(value);
  }
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/**
 * The next hint for a problem. The level is decided by the caller (the ladder
 * only moves one step at a time). Returns { text, source }.
 */
async function hintFor(problem, level, code) {
  const fallback = problem.hints[level - 1];
  const studentCode = String(code || '').slice(0, 4000);
  if (!studentCode.trim() || studentCode.includes('# Write your solution here\n    pass')) {
    // Nothing written yet: the fixed hint is as good as a tailored one
    return { text: fallback, source: 'bank' };
  }

  const prompt = `You are a DSA coach helping a student solve a problem without giving the answer away.

PROBLEM: ${problem.title} (${patternName(problem.pattern)}, ${problem.difficulty})
${problem.statement}

THE STUDENT'S CODE SO FAR:
${studentCode}

REFERENCE HINT FOR THIS LEVEL (rewrite it for the student's code, do not just repeat it):
${fallback}

Give hint level ${level} of 3, which is ${HINT_LEVELS[level]}
If their code already has the right idea, point at the specific part that is wrong instead.
Never write the full solution, never write Python code.

Return JSON only: {"hint": "..."}`;

  try {
    const result = await generateJson(prompt);
    const text = String(result.hint || '').trim();
    if (text) return { text: text.slice(0, 800), source: 'ai' };
  } catch (err) {
    console.warn('[coach] AI hint unavailable, using bank hint:', err.message);
  }
  return { text: fallback, source: 'bank' };
}

function isSmallCase(args) {
  return args.every((arg) => {
    if (Array.isArray(arg)) return arg.length <= 1;
    if (typeof arg === 'string') return arg.length <= 1;
    if (typeof arg === 'number') return Math.abs(arg) <= 1;
    return true;
  });
}

/**
 * Why a submission failed. `results` is what the browser runner reported:
 * { error, timedOut, timedOutKind, passedCount, total, failures: [{ args, expected, actual, error, kind }] }
 */
async function classifyFailure(problem, code, results) {
  const failures = Array.isArray(results.failures) ? results.failures : [];
  const first = failures[0] || null;
  const globalError = String(results.error || '');

  if (/SyntaxError|IndentationError|TabError/.test(globalError)) {
    return {
      type: 'syntax_error',
      explanation: `Python could not read the code: ${globalError.split('\n').slice(-1)[0].slice(0, 200)}`,
      fixHint: 'Check brackets, colons and indentation on the line mentioned.',
      source: 'rule',
    };
  }

  if (results.timedOut) {
    if (results.timedOutKind === 'large') {
      return {
        type: 'too_slow',
        explanation: 'Your code gives right answers on small inputs but did not finish on a large input in time.',
        fixHint: 'Work out the time complexity of your loops. Which pattern avoids checking every pair?',
        source: 'rule',
      };
    }
    return {
      type: 'logic_error',
      explanation: 'Your code never finished on a small input, so it is probably stuck in a loop that does not end.',
      fixHint: 'Check that every loop moves toward its exit condition on every pass.',
      source: 'rule',
    };
  }

  if (!first) {
    return { type: 'logic_error', explanation: globalError.slice(0, 300) || 'The submission did not pass.', fixHint: '', source: 'rule' };
  }

  if (first.kind === 'large' && /RecursionError/.test(first.error || '')) {
    return {
      type: 'too_slow',
      explanation: 'Small inputs pass, but on a large input the recursion goes deeper than Python allows.',
      fixHint: 'Can the same idea be written with a loop, or with memoisation so each state is computed once?',
      source: 'rule',
    };
  }

  // Rule-based guess, used when the AI is unavailable
  const passedSome = (results.passedCount || 0) > 0;
  let guess = 'logic_error';
  if (first.error) {
    guess = /IndexError/.test(first.error) ? 'off_by_one' : 'runtime_error';
  } else if (passedSome && isSmallCase(first.args || [])) {
    guess = 'edge_case';
  }

  const prompt = `You are a DSA coach. Classify why this submission failed.

PROBLEM: ${problem.title} (${patternName(problem.pattern)})
${problem.statement}

STUDENT CODE:
${String(code || '').slice(0, 4000)}

RESULT: passed ${results.passedCount || 0} of ${results.total || 0} cases.
FIRST FAILING CASE: input ${shortJson(first.args)}; expected ${shortJson(first.expected)}; ${first.error ? `error ${first.error}` : `got ${shortJson(first.actual)}`}

Choose exactly one type:
- "off_by_one": wrong loop bound, index, or < versus <=
- "edge_case": works in general but not for empty, single, duplicate, negative or extreme input
- "wrong_approach": the idea itself cannot solve the problem
- "logic_error": the idea is fine but a step is implemented wrongly
- "runtime_error": crashes for a reason other than an index bound

Return JSON only:
{"type": "...", "explanation": "at most two sentences pointing at the part of their code that causes it, without giving the solution", "fix_hint": "one short sentence or question that helps them fix it"}`;

  try {
    const result = await generateJson(prompt);
    if (AI_TYPES.includes(result.type)) {
      return {
        type: result.type,
        explanation: String(result.explanation || '').slice(0, 500),
        fixHint: String(result.fix_hint || '').slice(0, 300),
        source: 'ai',
      };
    }
  } catch (err) {
    console.warn('[coach] AI classification unavailable, using rule:', err.message);
  }

  const explanations = {
    off_by_one: `Your code raised ${first.error ? first.error.split(':')[0] : 'an error'}, which usually means a loop or index goes one step too far.`,
    runtime_error: `Your code crashed with ${String(first.error).slice(0, 150)}.`,
    edge_case: 'Most cases pass, but a very small input fails.',
    logic_error: `On input ${shortJson(first.args, 120)} the answer was ${shortJson(first.actual, 80)} instead of ${shortJson(first.expected, 80)}.`,
  };
  return { type: guess, explanation: explanations[guess], fixHint: '', source: 'rule' };
}

/**
 * When the same kind of mistake shows up again and again, return a plan
 * operation that adds a targeted drill. `currentType` is the mistake just made.
 */
async function drillForRepeatedMistake(candidateId, currentType, pattern) {
  if (!DRILL_ADVICE[currentType]) return null;

  const recent = await PracticeAttempt.find({ candidate: candidateId, kind: 'dsa', passed: false })
    .sort({ occurredAt: -1 })
    .limit(10)
    .select('mistake.type topic')
    .lean();
  const same = recent.filter((a) => a.mistake && a.mistake.type === currentType);
  if (same.length < 2) return null;

  const patterns = [...new Set(same.map((a) => patternName(a.topic)))];
  // Practise on an easier problem from the pattern where it just happened
  const practice = problemsForPattern(pattern)[0];
  const label = MISTAKE_LABELS[currentType];

  return {
    op: 'add',
    title: `Drill: ${label.toLowerCase()}`,
    description: `${DRILL_ADVICE[currentType]} Then solve "${practice.title}" without hints.`,
    category: 'skills',
    tool: 'dsa',
    toolTopic: practice.slug,
    priority: 'core',
    dueInDays: 5,
    origin: 'remedial',
    reason: `${same.length} of your last ${recent.length} failed submissions were "${label}" (${patterns.join(', ')}).`,
  };
}

module.exports = { MISTAKE_LABELS, DRILL_ADVICE, hintFor, classifyFailure, drillForRepeatedMistake };
