// Read-only access to the built DSA problem bank (data/dsa/problems.json).

const fs = require('fs');
const path = require('path');
const { PATTERNS, PATTERN_BY_KEY } = require('../../data/dsa/patterns');
const { problems: PROBLEMS } = require('../../data/dsa/problems.json');

const HARNESS = fs.readFileSync(path.join(__dirname, '..', '..', 'data', 'dsa', 'harness.py'), 'utf8');
const BY_SLUG = Object.fromEntries(PROBLEMS.map((p) => [p.slug, p]));
const DIFFICULTY_ORDER = { easy: 0, medium: 1, hard: 2 };

function getProblem(slug) {
  return BY_SLUG[slug] || null;
}

function problemsForPattern(patternKey) {
  return PROBLEMS.filter((p) => p.pattern === patternKey).sort(
    (a, b) => DIFFICULTY_ORDER[a.difficulty] - DIFFICULTY_ORDER[b.difficulty]
  );
}

function patternName(key) {
  return (PATTERN_BY_KEY[key] && PATTERN_BY_KEY[key].name) || key;
}

// Pattern key from a key, a display name, or a milestone topic such as "Binary Search"
function findPatternKey(text) {
  const value = String(text || '').trim().toLowerCase();
  if (!value) return null;
  if (PATTERN_BY_KEY[value]) return value;
  const exact = PATTERNS.find((p) => p.name.toLowerCase() === value);
  if (exact) return exact.key;
  const partial = PATTERNS.find((p) => value.includes(p.name.toLowerCase()) || p.name.toLowerCase().includes(value));
  return partial ? partial.key : null;
}

function starterCode(problem) {
  const args = problem.params.map((p) => p.name).join(', ');
  const types = problem.params.map((p) => `#   ${p.name}: ${p.type}`).join('\n');
  const helpers = problem.argKinds.includes('list_node') || problem.returnKind === 'list_node'
    ? '# ListNode(val, next) is available.\n'
    : problem.argKinds.includes('tree') || problem.returnKind === 'tree'
      ? '# TreeNode(val, left, right) is available.\n'
      : '';
  return `${helpers}${types}\ndef ${problem.functionName}(${args}):\n    # Write your solution here\n    pass\n`;
}

/**
 * What the browser needs to show and run a problem. Hidden cases are sent too,
 * because the code runs in the browser; hints are never sent here.
 */
function problemForStudent(problem, { solved = false } = {}) {
  return {
    slug: problem.slug,
    title: problem.title,
    pattern: problem.pattern,
    patternName: patternName(problem.pattern),
    difficulty: problem.difficulty,
    statement: problem.statement,
    constraints: problem.constraints,
    functionName: problem.functionName,
    params: problem.params,
    spec: {
      functionName: problem.functionName,
      argKinds: problem.argKinds,
      returnKind: problem.returnKind,
      compare: problem.compare,
    },
    examples: problem.examples,
    hiddenCases: [
      ...problem.tests.map((c) => ({ ...c, kind: 'hidden' })),
      ...problem.perf.map((c) => ({ ...c, kind: 'large' })),
    ],
    starterCode: starterCode(problem),
    // Shown once solved; before that it gives the approach away
    complexity: solved ? problem.complexity : null,
  };
}

module.exports = {
  PATTERNS,
  PATTERN_BY_KEY,
  PROBLEMS,
  HARNESS,
  getProblem,
  problemsForPattern,
  patternName,
  findPatternKey,
  starterCode,
  problemForStudent,
};
