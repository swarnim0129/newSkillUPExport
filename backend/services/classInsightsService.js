// What a mentor learns about a whole class at once, and what to set next.
// Rule-based so every number and suggestion can be traced to student data.

const PracticeProgress = require('../models/PracticeProgress');
const PracticeAttempt = require('../models/PracticeAttempt');
const StudentProfile = require('../models/StudentProfile');
const StudentEvent = require('../models/StudentEvent');
const { patternOverview } = require('./practice/masteryService');
const { PATTERNS, problemsForPattern } = require('./practice/dsaBank');
const { MISTAKE_LABELS } = require('./practice/coachService');
const { DAY_MS } = require('./journey/clock');

const WEAK_PATTERN_LEVEL = 60;
const MISTAKE_WINDOW_DAYS = 60;
const INTERVIEW_WINDOW_DAYS = 30;

// Short advice a mentor can post when a mistake type keeps coming up
const MISTAKE_TIPS = {
  runtime_error: 'Before submitting, run your code on an empty input and a single-element input.',
  too_slow: 'Write down the time complexity before coding. If it is O(n²) on n = 10⁵, look for a hash map or two pointers.',
  edge_case: 'List the edge cases first: empty, one element, duplicates, negatives, the largest input.',
  off_by_one: 'Check loop bounds on a 2-element example by hand: does the last index get visited exactly once?',
  wrong_approach: 'Name the pattern before writing code. If you cannot, re-read the problem constraints.',
  logic_error: 'Trace your code on the first failing example line by line before changing anything.',
  concept_gap: 'Revisit the concept notes before attempting more questions on it.',
  calculation_error: 'Write units at every step and recheck the arithmetic before the final answer.',
};

function average(values) {
  return values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : 0;
}

/**
 * @param {Array} members     ClassMember rows
 * @param {Array} summaries   mentorService summaries for members with a journey
 * @param {Array} work        [{ assignment, statuses: [status per member] }]
 */
async function classInsights(members, summaries, work) {
  const ids = members.map((m) => m.candidate);
  const now = new Date();

  const [progressRows, failed, profiles, interviews] = await Promise.all([
    PracticeProgress.find({ candidate: { $in: ids } }).lean(),
    PracticeAttempt.find({
      candidate: { $in: ids },
      passed: false,
      'mistake.type': { $exists: true },
      occurredAt: { $gte: new Date(now - MISTAKE_WINDOW_DAYS * DAY_MS) },
    }).select('candidate mistake.type').lean(),
    StudentProfile.find({ candidate: { $in: ids } }).select('candidate skills').lean(),
    StudentEvent.find({
      candidate: { $in: ids },
      type: 'interview_completed',
      occurredAt: { $gte: new Date(now - INTERVIEW_WINDOW_DAYS * DAY_MS) },
    }).select('candidate').lean(),
  ]);

  // DSA: average pattern level across the class, and who has solved each problem
  const progressBy = {};
  progressRows.forEach((p) => {
    (progressBy[String(p.candidate)] = progressBy[String(p.candidate)] || []).push(p);
  });
  const solvers = {};
  progressRows.filter((p) => p.solved).forEach((p) => { solvers[p.slug] = (solvers[p.slug] || 0) + 1; });
  const levelsPerStudent = ids.map((id) => patternOverview(progressBy[String(id)] || [], now).levels);
  const patterns = PATTERNS.map((p) => ({
    key: p.key,
    name: p.name,
    average: average(levelsPerStudent.map((l) => l[p.key] || 0)),
    mastered: levelsPerStudent.filter((l) => (l[p.key] || 0) >= 75).length,
  }));

  // Mistakes: how often each type shows up, and in how many students
  const mistakeMap = {};
  failed.forEach((a) => {
    const type = a.mistake && a.mistake.type;
    if (!type || type === 'syntax_error') return;
    const entry = (mistakeMap[type] = mistakeMap[type] || { type, label: MISTAKE_LABELS[type] || type, count: 0, students: new Set() });
    entry.count += 1;
    entry.students.add(String(a.candidate));
  });
  const mistakes = Object.values(mistakeMap)
    .map((m) => ({ type: m.type, label: m.label, count: m.count, students: m.students.size }))
    .sort((a, b) => b.count - a.count);

  // Tested subjects (not DSA): lowest class averages where at least two students have results
  const subjectMap = {};
  profiles.forEach((p) => (p.skills || []).forEach((s) => {
    if (!s.evidenceCount || /^dsa:/i.test(s.name)) return;
    (subjectMap[s.name] = subjectMap[s.name] || []).push(s.level);
  }));
  const subjects = Object.entries(subjectMap)
    .filter(([, levels]) => levels.length >= Math.min(2, ids.length))
    .map(([name, levels]) => ({ name, average: average(levels), students: levels.length }))
    .sort((a, b) => a.average - b.average);

  // Classwork completion
  const DONE = ['done', 'late', 'returned', 'returned_late'];
  const classwork = work.map(({ assignment, statuses }) => ({
    id: String(assignment._id),
    title: assignment.title,
    type: assignment.type,
    dueAt: assignment.dueAt,
    done: statuses.filter((s) => DONE.includes(s)).length,
    late: statuses.filter((s) => s === 'late' || s === 'returned_late').length,
    missing: statuses.filter((s) => s === 'missing').length,
    total: statuses.length,
  }));
  const totalSlots = classwork.reduce((sum, c) => sum + c.total, 0);
  const doneSlots = classwork.reduce((sum, c) => sum + c.done, 0);

  const interviewed = new Set(interviews.map((e) => String(e.candidate)));
  const readiness = summaries.map((s) => s.readiness).filter((v) => typeof v === 'number');

  const overview = {
    students: ids.length,
    withJourney: summaries.length,
    readiness: average(readiness),
    completion: totalSlots ? Math.round((100 * doneSlots) / totalSlots) : null,
    atRisk: summaries.filter((s) => s.risk === 'high').length,
    inactive: summaries.filter((s) => s.flags.some((f) => f.code === 'inactive')).length,
    interviewedRecently: interviewed.size,
  };

  return {
    overview,
    patterns,
    weakestPatterns: patterns.filter((p) => p.average < WEAK_PATTERN_LEVEL).slice(0, 3),
    mistakes,
    subjects: subjects.slice(0, 5),
    classwork,
    atRisk: summaries.filter((s) => s.risk !== 'low').slice(0, 8).map((s) => ({
      candidateId: s.candidateId, name: s.name, risk: s.risk, flags: s.flags.map((f) => f.label),
    })),
    suggestions: suggest({ ids, patterns, solvers, mistakes, subjects, interviewed, summaries }),
  };
}

/**
 * Ready-to-assign next steps. Each one carries a prefilled assignment (or
 * announcement) the mentor can post with one click, and the reason for it.
 */
function suggest({ ids, patterns, solvers, mistakes, subjects, interviewed, summaries }) {
  const list = [];
  if (!ids.length) return list;

  // First pattern in teaching order the class has not got comfortable with
  const weak = patterns.find((p) => p.average < WEAK_PATTERN_LEVEL);
  if (weak) {
    const problems = problemsForPattern(weak.key)
      .map((p) => ({ slug: p.slug, title: p.title, solvedBy: solvers[p.slug] || 0 }))
      .sort((a, b) => a.solvedBy - b.solvedBy)
      .slice(0, 3);
    if (problems.length) {
      list.push({
        id: `dsa:${weak.key}`,
        kind: 'assignment',
        title: `Practise ${weak.name}`,
        reason: `Class average in ${weak.name} is ${weak.average}/100. These ${problems.length} problems have the fewest solvers.`,
        draft: {
          type: 'dsa_problems',
          title: `${weak.name}: ${problems.length} problems`,
          instructions: 'Solve these in Practice. Use the hint ladder before looking anything up.',
          target: { slugs: problems.map((p) => p.slug) },
          dueInDays: 7,
        },
      });
    }
  }

  // A mistake type that several students keep making
  const common = mistakes.find((m) => m.students >= Math.max(2, Math.ceil(ids.length / 4)));
  if (common) {
    list.push({
      id: `mistake:${common.type}`,
      kind: 'announcement',
      title: `Address "${common.label}"`,
      reason: `${common.students} students made this mistake ${common.count} times in the last ${MISTAKE_WINDOW_DAYS} days.`,
      draft: {
        text: `Many of you are losing marks to one mistake: ${common.label.toLowerCase()}. ${MISTAKE_TIPS[common.type] || ''} Your mistake journal in Practice shows each time it happened.`.trim(),
      },
    });
  }

  // The weakest tested subject
  const subject = subjects.find((s) => s.average < 60);
  if (subject) {
    list.push({
      id: `lab:${subject.name}`,
      kind: 'assignment',
      title: `Revise ${subject.name}`,
      reason: `Class average in ${subject.name} is ${subject.average}/100 across ${subject.students} students.`,
      draft: {
        type: 'lab_subject',
        title: `${subject.name} practice set`,
        instructions: 'Take a Practice Lab set and aim for the score below. The set targets concepts you missed before.',
        target: { subject: subject.name, minScore: 70 },
        dueInDays: 7,
      },
    });
  }

  // Senior students who have not practised interviewing lately
  const seniors = summaries.filter((s) => s.year >= 3);
  const notInterviewed = seniors.filter((s) => !interviewed.has(s.candidateId));
  if (seniors.length && notInterviewed.length >= Math.ceil(seniors.length / 2)) {
    list.push({
      id: 'interview',
      kind: 'assignment',
      title: 'Mock interview round',
      reason: `${notInterviewed.length} of ${seniors.length} third and final-year students have not done a mock interview in ${INTERVIEW_WINDOW_DAYS} days.`,
      draft: {
        type: 'mock_interview',
        title: 'Mock interview round',
        instructions: 'Do one AI mock interview for the role you are targeting. Read the feedback and note one thing to fix.',
        target: { minScore: 60 },
        dueInDays: 10,
      },
    });
  }

  return list;
}

module.exports = { classInsights };
