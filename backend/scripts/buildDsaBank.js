// Builds data/dsa/problems.json from data/dsa/problems.source.js.
//
// Every expected answer is produced by running the problem's reference
// solution through data/dsa/harness.py, and the reference solution is then
// checked against all of its own tests, so a wrong test or a wrong solution
// fails the build instead of reaching students.
//
// Usage: npm run build:dsa   (needs python3 on the PATH)

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { PROBLEMS } = require('../data/dsa/problems.source');
const { PATTERN_BY_KEY } = require('../data/dsa/patterns');

const DATA_DIR = path.join(__dirname, '..', 'data', 'dsa');
const HARNESS = fs.readFileSync(path.join(DATA_DIR, 'harness.py'), 'utf8');

const PYTHON_DRIVER = `
import json, sys, time
namespace = {}
exec(sys.argv[1], namespace)
jobs = json.loads(sys.stdin.read())
report = []
for job in jobs:
    spec = json.dumps(job["spec"])
    started = time.perf_counter()
    expected = json.loads(namespace["expected_outputs"](job["solution"], spec, json.dumps([{"args": a} for a in job["cases"]])))
    ref_ns = {"ListNode": namespace["ListNode"], "TreeNode": namespace["TreeNode"]}
    exec(job["solution"], ref_ns)
    cases = [{"args": a, "expected": e} for a, e in zip(job["cases"], expected)]
    checked = json.loads(namespace["run_tests"](ref_ns, spec, json.dumps(cases)))
    failed = [i for i, r in enumerate(checked["results"]) if not r["passed"]]
    report.append({"slug": job["slug"], "expected": expected, "failed": failed,
                   "seconds": round(time.perf_counter() - started, 3)})
print(json.dumps(report))
`;

function validateShape(problem) {
  const problems = [];
  const required = ['slug', 'title', 'pattern', 'difficulty', 'statement', 'functionName', 'params',
    'argKinds', 'returnKind', 'compare', 'examples', 'tests', 'hints', 'solution'];
  required.forEach((key) => { if (problem[key] === undefined) problems.push(`missing ${key}`); });
  if (!PATTERN_BY_KEY[problem.pattern]) problems.push(`unknown pattern ${problem.pattern}`);
  if (!['easy', 'medium', 'hard'].includes(problem.difficulty)) problems.push('bad difficulty');
  if (problem.params && problem.argKinds && problem.params.length !== problem.argKinds.length) problems.push('params and argKinds differ in length');
  if (!Array.isArray(problem.hints) || problem.hints.length !== 3) problems.push('needs exactly 3 hints');
  [...(problem.examples || []), ...(problem.tests || []), ...(problem.perf || [])].forEach((args, i) => {
    if (!Array.isArray(args) || args.length !== problem.argKinds.length) problems.push(`case ${i} has the wrong number of arguments`);
  });
  return problems;
}

function main() {
  const slugs = new Set();
  const shapeErrors = [];
  PROBLEMS.forEach((p) => {
    if (slugs.has(p.slug)) shapeErrors.push(`${p.slug}: duplicate slug`);
    slugs.add(p.slug);
    validateShape(p).forEach((e) => shapeErrors.push(`${p.slug}: ${e}`));
  });
  if (shapeErrors.length) {
    console.error(shapeErrors.join('\n'));
    process.exit(1);
  }

  const jobs = PROBLEMS.map((p) => ({
    slug: p.slug,
    solution: p.solution,
    spec: { functionName: p.functionName, argKinds: p.argKinds, returnKind: p.returnKind, compare: p.compare },
    cases: [...p.examples, ...p.tests, ...(p.perf || [])],
  }));

  const run = spawnSync('python3', ['-c', PYTHON_DRIVER, HARNESS], {
    input: JSON.stringify(jobs),
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  });
  if (run.status !== 0) {
    console.error(run.stderr);
    process.exit(1);
  }

  const report = JSON.parse(run.stdout);
  const broken = report.filter((r) => r.failed.length > 0);
  if (broken.length) {
    broken.forEach((r) => console.error(`${r.slug}: reference solution fails its own cases ${r.failed.join(', ')}`));
    process.exit(1);
  }

  const bySlug = Object.fromEntries(report.map((r) => [r.slug, r]));
  const problems = PROBLEMS.map((p) => {
    const expected = bySlug[p.slug].expected;
    const all = [...p.examples, ...p.tests, ...(p.perf || [])].map((args, i) => ({ args, expected: expected[i] }));
    const exampleCount = p.examples.length;
    const testCount = p.tests.length;
    return {
      slug: p.slug,
      title: p.title,
      pattern: p.pattern,
      difficulty: p.difficulty,
      statement: p.statement,
      constraints: p.constraints || [],
      functionName: p.functionName,
      params: p.params,
      argKinds: p.argKinds,
      returnKind: p.returnKind,
      compare: p.compare,
      examples: all.slice(0, exampleCount),
      tests: all.slice(exampleCount, exampleCount + testCount),
      perf: all.slice(exampleCount + testCount),
      hints: p.hints,
      complexity: p.complexity || '',
    };
  });

  fs.writeFileSync(path.join(DATA_DIR, 'problems.json'), JSON.stringify({ version: 1, problems }));
  const slowest = [...report].sort((a, b) => b.seconds - a.seconds).slice(0, 3);
  console.log(`Built ${problems.length} problems. All reference solutions pass. Slowest: ${slowest.map((r) => `${r.slug} ${r.seconds}s`).join(', ')}`);
}

main();
