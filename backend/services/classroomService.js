// Classrooms: a mentor's class, its classwork, and how each student's work is
// checked. Most classwork is checked automatically from what the student does
// on the platform (DSA practice, Practice Lab, mock interviews, resume
// analysis), and every assignment also lands in the student's journey plan.

const crypto = require('crypto');
const Classroom = require('../models/Classroom');
const ClassMember = require('../models/ClassMember');
const Assignment = require('../models/Assignment');
const Submission = require('../models/Submission');
const Mentor = require('../models/Mentor');
const StudentProfile = require('../models/StudentProfile');
const JourneyPlan = require('../models/JourneyPlan');
const StudentEvent = require('../models/StudentEvent');
const PracticeProgress = require('../models/PracticeProgress');
const { patternOverview } = require('./practice/masteryService');
const { getProblem, patternName } = require('./practice/dsaBank');
const { applyOps, logChange, isOpen, formatDate } = require('./journey/planService');
const { journeyNow, addDays } = require('./journey/clock');

const CODE_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
const CODE_LENGTH = 7;

const TYPE_LABELS = {
  dsa_problems: 'DSA problems',
  dsa_pattern: 'DSA pattern level',
  lab_subject: 'Practice Lab',
  mock_interview: 'Mock interview',
  resume: 'Resume score',
  quiz: 'Quiz',
  task: 'Task',
};

const TYPE_CATEGORY = {
  dsa_problems: 'skills',
  dsa_pattern: 'skills',
  lab_subject: 'academics',
  mock_interview: 'career',
  resume: 'career',
  quiz: 'academics',
  task: 'projects',
};

const AUTO_TYPES = ['dsa_problems', 'dsa_pattern', 'lab_subject', 'mock_interview', 'resume'];

function makeClassCode() {
  const bytes = crypto.randomBytes(CODE_LENGTH);
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}

function normalizeCode(code) {
  return String(code || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 12);
}

async function createWithCode(data) {
  // A clash on a 7-character code is unlikely; retry a few times anyway
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await Classroom.create({ ...data, code: makeClassCode() });
    } catch (err) {
      if (!(err && err.code === 11000 && err.keyPattern && err.keyPattern.code)) throw err;
    }
  }
  throw new Error('Could not create a class code, please try again');
}

async function regenerateCode(classroom) {
  for (let attempt = 0; attempt < 5; attempt++) {
    classroom.code = makeClassCode();
    try {
      return await classroom.save();
    } catch (err) {
      if (!(err && err.code === 11000 && err.keyPattern && err.keyPattern.code)) throw err;
    }
  }
  throw new Error('Could not create a class code, please try again');
}

// ─── Checking work ──────────────────────────────────────────────────────────

/** Everything the auto-checks read for one student, loaded once. */
async function loadEvidence(candidateId) {
  const [progress, events] = await Promise.all([
    PracticeProgress.find({ candidate: candidateId }).lean(),
    StudentEvent.find({
      candidate: candidateId,
      type: { $in: ['interview_completed', 'resume_analyzed', 'quiz_completed'] },
    })
      .sort({ occurredAt: -1 })
      .limit(300)
      .select('type topic score occurredAt meta')
      .lean(),
  ]);
  const solved = new Set(progress.filter((p) => p.solved).map((p) => p.slug));
  const levels = patternOverview(progress, new Date()).levels;
  return { solved, levels, events };
}

function sameTopic(a, b) {
  const x = String(a || '').trim().toLowerCase();
  const y = String(b || '').trim().toLowerCase();
  return !!x && !!y && (x === y || x.includes(y) || y.includes(x));
}

/**
 * Best result since the assignment was set, for score-based work.
 * Work done before the assignment does not count, so it reflects the task.
 */
function bestScoreSince(events, { type, since, topic, source }) {
  let best = null;
  events.forEach((e) => {
    if (e.type !== type || typeof e.score !== 'number') return;
    if (new Date(e.occurredAt) < new Date(since)) return;
    if (topic && !sameTopic(e.topic, topic)) return;
    if (source && !(e.meta && e.meta.source === source)) return;
    if (best === null || e.score > best) best = e.score;
  });
  return best;
}

/**
 * How far a student is with one assignment. Pure: reads evidence and the
 * existing submission, returns { progress 0-1, label, done, score }.
 */
function evaluate(assignment, evidence, submission) {
  const t = assignment.target || {};
  switch (assignment.type) {
    case 'dsa_problems': {
      const slugs = t.slugs || [];
      const done = slugs.filter((s) => evidence.solved.has(s)).length;
      return {
        progress: slugs.length ? done / slugs.length : 0,
        label: `${done} of ${slugs.length} solved`,
        done: slugs.length > 0 && done === slugs.length,
        score: null,
      };
    }
    case 'dsa_pattern': {
      const level = evidence.levels[t.pattern] || 0;
      const goal = Math.max(1, t.level || 1);
      return { progress: Math.min(1, level / goal), label: `Level ${level} of ${goal}`, done: level >= goal, score: level };
    }
    case 'lab_subject': {
      const best = bestScoreSince(evidence.events, { type: 'quiz_completed', since: assignment.createdAt, topic: t.subject, source: 'lab' });
      return scoreResult(best, t.minScore, 'No set taken yet');
    }
    case 'mock_interview': {
      const best = bestScoreSince(evidence.events, { type: 'interview_completed', since: assignment.createdAt, topic: t.role || '' });
      return scoreResult(best, t.minScore, 'No interview yet');
    }
    case 'resume': {
      const best = bestScoreSince(evidence.events, { type: 'resume_analyzed', since: assignment.createdAt });
      return scoreResult(best, t.minScore, 'No analysis yet');
    }
    case 'quiz': {
      const taken = submission && typeof submission.score === 'number';
      return {
        progress: taken ? 1 : 0,
        label: taken ? `Scored ${submission.score}/100` : 'Not taken',
        done: !!taken,
        score: taken ? submission.score : null,
      };
    }
    case 'task': {
      const handed = submission && submission.turnedInAt;
      return { progress: handed ? 1 : 0, label: handed ? 'Turned in' : 'Not turned in', done: !!handed, score: null };
    }
    default:
      return { progress: 0, label: '', done: false, score: null };
  }
}

function scoreResult(best, minScore, emptyLabel) {
  const goal = Math.max(1, minScore || 1);
  if (best === null) return { progress: 0, label: emptyLabel, done: false, score: null };
  return {
    progress: Math.min(1, best / goal),
    label: `Best ${best}/100, needs ${minScore || 0}`,
    done: best >= (minScore || 0),
    score: best,
  };
}

/**
 * State shown to mentor and student. Uses real time: a class deadline is a
 * real date, whatever the student's demo clock says.
 */
function statusOf(assignment, submission, now = new Date()) {
  if (submission && submission.completedAt) {
    const late = assignment.dueAt && new Date(submission.completedAt) > new Date(assignment.dueAt);
    if (submission.returnedAt) return late ? 'returned_late' : 'returned';
    return late ? 'late' : 'done';
  }
  if (assignment.dueAt && new Date(assignment.dueAt) < now) return 'missing';
  if (submission && submission.progress > 0) return 'in_progress';
  return 'assigned';
}

const DONE_STATUSES = ['done', 'late', 'returned', 'returned_late'];

// ─── Plan milestones ────────────────────────────────────────────────────────

function milestoneTitle(assignment, classroom) {
  return `${assignment.title} (${classroom.name})`.slice(0, 140);
}

function milestoneDue(assignment, profile) {
  const now = journeyNow(profile);
  if (!assignment.dueAt) return addDays(now, 14);
  const due = new Date(assignment.dueAt);
  // A demo student's clock can run ahead of real time; keep the due date ahead of it
  return due < now ? addDays(now, 3) : due;
}

function findPlanMilestone(plan, submission) {
  if (!submission || !submission.milestoneId) return null;
  return plan.milestones.id(submission.milestoneId) || null;
}

/** Add the assignment to the plan when missing, complete it when the work is done. */
function syncMilestone({ profile, plan, classroom, assignment, submission, mentorName, done }) {
  const existing = findPlanMilestone(plan, submission);
  const now = journeyNow(profile);

  if (existing) {
    if (done && isOpen(existing)) {
      return applyOps(profile, plan, [{ op: 'complete', ref: existing._id, fromClass: true, reason: `Done for ${classroom.name}.` }], now);
    }
    return [];
  }
  if (done) return [];

  const before = plan.milestones.length;
  const changes = applyOps(profile, plan, [{
    op: 'add',
    title: milestoneTitle(assignment, classroom),
    description: (assignment.instructions || TYPE_LABELS[assignment.type]).slice(0, 500),
    category: TYPE_CATEGORY[assignment.type] || 'skills',
    tool: 'classwork',
    toolTopic: `${classroom._id}?work=${assignment._id}`,
    priority: 'core',
    dueAt: milestoneDue(assignment, profile),
    origin: 'mentor',
    reason: `Set by ${mentorName} in ${classroom.name}.`,
  }], now);
  if (plan.milestones.length > before) {
    submission.milestoneId = plan.milestones[plan.milestones.length - 1]._id;
  } else {
    // Same title already open (for example after a demo reset): adopt it
    const title = milestoneTitle(assignment, classroom).toLowerCase();
    const match = plan.milestones.find((m) => isOpen(m) && m.title.toLowerCase() === title);
    if (match) submission.milestoneId = match._id;
  }
  return changes;
}

/**
 * Bring one student's classwork up to date: check auto-checked work, store
 * progress, and keep their journey plan in step. Safe to call often.
 * Returns [{ classroom, assignment, submission, status }].
 */
async function syncStudent(candidateId, { classroomId = null } = {}) {
  const memberQuery = { candidate: candidateId };
  if (classroomId) memberQuery.classroom = classroomId;
  const memberships = await ClassMember.find(memberQuery).select('classroom').lean();
  if (!memberships.length) return [];

  const classrooms = await Classroom.find({ _id: { $in: memberships.map((m) => m.classroom) }, archived: false }).lean();
  if (!classrooms.length) return [];
  const classById = Object.fromEntries(classrooms.map((c) => [String(c._id), c]));

  const [assignments, submissions, evidence, profile, plan, mentors] = await Promise.all([
    Assignment.find({ classroom: { $in: classrooms.map((c) => c._id) } }).sort({ createdAt: 1 }).lean(),
    Submission.find({ candidate: candidateId, classroom: { $in: classrooms.map((c) => c._id) } }),
    loadEvidence(candidateId),
    StudentProfile.findOne({ candidate: candidateId }),
    JourneyPlan.findOne({ candidate: candidateId }),
    Mentor.find({ _id: { $in: classrooms.map((c) => c.mentor) } }).select('name').lean(),
  ]);
  const subByAssignment = Object.fromEntries(submissions.map((s) => [String(s.assignment), s]));
  const mentorName = Object.fromEntries(mentors.map((m) => [String(m._id), m.name]));
  const now = new Date();

  const results = [];
  const planChanges = [];
  for (const assignment of assignments) {
    const classroom = classById[String(assignment.classroom)];
    let submission = subByAssignment[String(assignment._id)];
    if (!submission) {
      submission = new Submission({ assignment: assignment._id, classroom: classroom._id, candidate: candidateId });
    }

    const result = evaluate(assignment, evidence, submission);
    submission.progress = Math.round(result.progress * 100) / 100;
    submission.progressLabel = result.label;
    if (result.done && !submission.completedAt) {
      // Handed-in work counts from when it was handed in, so lateness is fair
      submission.completedAt = submission.turnedInAt || now;
      // Auto-checked and quiz work grades itself; tasks wait for the mentor
      if (assignment.type === 'quiz') submission.grade = Math.round(((result.score || 0) / 100) * assignment.points);
      else if (assignment.type !== 'task') submission.grade = assignment.points;
    }
    if (typeof result.score === 'number' && assignment.type !== 'quiz') submission.score = result.score;

    if (profile && plan) {
      planChanges.push(...syncMilestone({
        profile, plan, classroom, assignment, submission,
        mentorName: mentorName[String(classroom.mentor)] || 'your mentor',
        done: !!submission.completedAt,
      }));
    }
    if (submission.isNew || submission.isModified()) await submission.save();
    results.push({ classroom, assignment, submission, status: statusOf(assignment, submission, now) });
  }

  if (plan && planChanges.length) {
    const added = planChanges.filter((c) => c.action === 'add').length;
    const completed = planChanges.filter((c) => c.action === 'complete').length;
    const parts = [];
    if (added) parts.push(`${added} piece${added > 1 ? 's' : ''} of class work added`);
    if (completed) parts.push(`${completed} finished`);
    logChange(plan, 'mentor', `Class work: ${parts.join(', ')}.`, planChanges, journeyNow(profile));
    await plan.save();
  }
  return results;
}

/** Take a class's open work out of a student's plan (they left, or work was deleted). */
async function dropFromPlan(candidateId, submissions, reason) {
  const [profile, plan] = await Promise.all([
    StudentProfile.findOne({ candidate: candidateId }),
    JourneyPlan.findOne({ candidate: candidateId }),
  ]);
  if (!profile || !plan) return;
  const ops = submissions
    .filter((s) => s.milestoneId)
    .map((s) => ({ op: 'skip', ref: s.milestoneId, fromClass: true, reason }));
  const changes = applyOps(profile, plan, ops, journeyNow(profile));
  if (changes.length) {
    logChange(plan, 'mentor', reason, changes, journeyNow(profile));
    await plan.save();
  }
}

/** Mentor changed the title or due date: carry it into each student's plan. */
async function updatePlans(assignment, classroom) {
  const submissions = await Submission.find({ assignment: assignment._id, milestoneId: { $ne: null }, completedAt: null }).lean();
  for (const s of submissions) {
    const [profile, plan] = await Promise.all([
      StudentProfile.findOne({ candidate: s.candidate }),
      JourneyPlan.findOne({ candidate: s.candidate }),
    ]);
    if (!profile || !plan) continue;
    const milestone = plan.milestones.id(s.milestoneId);
    if (!milestone || !isOpen(milestone)) continue;
    milestone.title = milestoneTitle(assignment, classroom);
    milestone.description = (assignment.instructions || TYPE_LABELS[assignment.type]).slice(0, 500);
    milestone.dueAt = milestoneDue(assignment, profile);
    logChange(plan, 'mentor', `Your mentor changed "${assignment.title}", now due ${formatDate(milestone.dueAt)}.`,
      [{ action: 'update', title: milestone.title, detail: 'Updated by your mentor.' }], journeyNow(profile));
    await plan.save();
  }
}

/** Subjects a student may practise in the Lab beyond their branch list: set by a class, an active panic-mode sprint, or recent snapped notes. */
async function extraLabSubjects(candidateId) {
  const Sprint = require('../models/Sprint');
  const SnapNote = require('../models/SnapNote');
  const [fromClasses, sprints, snaps] = await Promise.all([
    classLabSubjects(candidateId),
    Sprint.find({ candidate: candidateId, active: true, examAt: { $gte: new Date() } }).select('subject').lean(),
    SnapNote.find({ candidate: candidateId }).sort({ createdAt: -1 }).limit(10).select('subject').lean(),
  ]);
  return [...new Set([...fromClasses, ...sprints.map((s) => s.subject), ...snaps.map((s) => s.subject)].filter(Boolean))];
}

/** Subjects a student may practise in the Lab because a class set them. */
async function classLabSubjects(candidateId) {
  const memberships = await ClassMember.find({ candidate: candidateId }).select('classroom').lean();
  if (!memberships.length) return [];
  const list = await Assignment.find({ classroom: { $in: memberships.map((m) => m.classroom) }, type: 'lab_subject' })
    .select('target.subject')
    .lean();
  return [...new Set(list.map((a) => a.target && a.target.subject).filter(Boolean))];
}

// ─── Shapes sent to the browser ─────────────────────────────────────────────

function describeTarget(assignment) {
  const t = assignment.target || {};
  switch (assignment.type) {
    case 'dsa_problems':
      return `Solve ${(t.slugs || []).length} problem${(t.slugs || []).length === 1 ? '' : 's'} in Practice`;
    case 'dsa_pattern':
      return `Reach level ${t.level} in ${patternName(t.pattern)}`;
    case 'lab_subject':
      return `Score ${t.minScore}+ on a Practice Lab set in ${t.subject}`;
    case 'mock_interview':
      return `Score ${t.minScore}+ in a mock interview${t.role ? ` for ${t.role}` : ''}`;
    case 'resume':
      return `Get your resume to ${t.minScore}+ in the analyzer`;
    case 'quiz':
      return `${(assignment.questions || []).length}-question quiz`;
    default:
      return 'Hand in your work';
  }
}

/** Where the student goes to do the work. */
function workLink(assignment) {
  const t = assignment.target || {};
  switch (assignment.type) {
    case 'dsa_problems':
      return (t.slugs || [])[0] ? `/candidate/practice/${t.slugs[0]}` : '/candidate/practice';
    case 'dsa_pattern':
      return `/candidate/practice?focus=${encodeURIComponent(t.pattern || '')}`;
    case 'lab_subject':
      return `/candidate/practice?tab=lab&subject=${encodeURIComponent(t.subject || '')}`;
    case 'mock_interview':
      return '/candidate/ai-interview';
    case 'resume':
      return '/candidate/resume-analyzer';
    default:
      return null;
  }
}

function publicAssignment(assignment, { forMentor = false } = {}) {
  const t = assignment.target || {};
  return {
    id: String(assignment._id),
    type: assignment.type,
    typeLabel: TYPE_LABELS[assignment.type],
    auto: AUTO_TYPES.includes(assignment.type),
    title: assignment.title,
    instructions: assignment.instructions,
    target: {
      slugs: t.slugs || [],
      problems: (t.slugs || []).map((slug) => {
        const p = getProblem(slug);
        return { slug, title: p ? p.title : slug, difficulty: p ? p.difficulty : null, pattern: p ? patternName(p.pattern) : '' };
      }),
      pattern: t.pattern || '',
      patternName: t.pattern ? patternName(t.pattern) : '',
      level: t.level || 0,
      subject: t.subject || '',
      role: t.role || '',
      minScore: t.minScore || 0,
    },
    summary: describeTarget(assignment),
    link: workLink(assignment),
    points: assignment.points,
    dueAt: assignment.dueAt,
    createdAt: assignment.createdAt,
    questionCount: (assignment.questions || []).length,
    ...(forMentor ? { questions: assignment.questions || [] } : {}),
  };
}

function publicSubmission(submission, assignment, now = new Date()) {
  if (!submission) {
    return { status: statusOf(assignment, null, now), progress: 0, progressLabel: '', grade: null, feedback: '', text: '', link: '', turnedInAt: null, completedAt: null, score: null, returnedAt: null };
  }
  return {
    status: statusOf(assignment, submission, now),
    progress: submission.progress,
    progressLabel: submission.progressLabel,
    grade: submission.grade,
    feedback: submission.feedback,
    text: submission.text,
    link: submission.link,
    turnedInAt: submission.turnedInAt,
    completedAt: submission.completedAt,
    score: submission.score,
    returnedAt: submission.returnedAt,
  };
}

function publicClassroom(classroom, { forMentor = false } = {}) {
  return {
    id: String(classroom._id),
    name: classroom.name,
    section: classroom.section,
    subject: classroom.subject,
    description: classroom.description,
    theme: classroom.theme,
    archived: classroom.archived,
    createdAt: classroom.createdAt,
    ...(forMentor ? { code: classroom.code, joinOpen: classroom.joinOpen } : {}),
  };
}

function publicPost(post, viewer) {
  const mine = (authorType, author) => viewer && viewer.type === authorType && String(author) === String(viewer.id);
  return {
    id: String(post._id),
    kind: post.kind,
    authorType: post.authorType,
    authorName: post.authorName,
    mine: mine(post.authorType, post.author),
    text: post.text,
    assignmentId: post.assignment ? String(post.assignment) : null,
    pinned: post.pinned,
    createdAt: post.createdAt,
    comments: (post.comments || []).map((c) => ({
      id: String(c._id),
      authorType: c.authorType,
      authorName: c.authorName,
      mine: mine(c.authorType, c.author),
      text: c.text,
      at: c.at,
    })),
  };
}

/**
 * Class standings: points from graded work, then on-time finishes.
 * `rows` is [{ candidateId, name, submissions: [...] }].
 */
function leaderboard(rows, assignmentsById) {
  return rows
    .map((row) => {
      let points = 0;
      let onTime = 0;
      let finished = 0;
      row.submissions.forEach((s) => {
        const assignment = assignmentsById[String(s.assignment)];
        if (!assignment) return;
        if (typeof s.grade === 'number') points += s.grade;
        if (s.completedAt) {
          finished += 1;
          if (!assignment.dueAt || new Date(s.completedAt) <= new Date(assignment.dueAt)) onTime += 1;
        }
      });
      return { candidateId: row.candidateId, name: row.name, points, onTime, finished };
    })
    .sort((a, b) => b.points - a.points || b.onTime - a.onTime || a.name.localeCompare(b.name))
    .map((row, index) => ({ ...row, rank: index + 1 }));
}

module.exports = {
  TYPE_LABELS,
  AUTO_TYPES,
  DONE_STATUSES,
  makeClassCode,
  normalizeCode,
  createWithCode,
  regenerateCode,
  loadEvidence,
  evaluate,
  statusOf,
  syncStudent,
  dropFromPlan,
  updatePlans,
  classLabSubjects,
  extraLabSubjects,
  publicAssignment,
  publicSubmission,
  publicClassroom,
  publicPost,
  leaderboard,
  describeTarget,
};
