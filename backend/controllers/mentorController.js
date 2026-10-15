// Faculty mentor side: run classes like Google Classroom. Create a class, share
// its code, post to the stream, set classwork that is checked from students'
// own practice, grade hand-ins, and see where the class is struggling.

const mongoose = require('mongoose');
const Mentor = require('../models/Mentor');
const Candidate = require('../models/Candidate');
const StudentProfile = require('../models/StudentProfile');
const JourneyPlan = require('../models/JourneyPlan');
const CompanionMessage = require('../models/CompanionMessage');
const PracticeAttempt = require('../models/PracticeAttempt');
const Classroom = require('../models/Classroom');
const ClassMember = require('../models/ClassMember');
const ClassPost = require('../models/ClassPost');
const Assignment = require('../models/Assignment');
const Submission = require('../models/Submission');
const { makeMentorCode, summarise, summariesFor, displayName } = require('../services/mentorService');
const classrooms = require('../services/classroomService');
const { classInsights } = require('../services/classInsightsService');
const { generateJson } = require('../services/aiJson');
const { PATTERNS, PROBLEMS, getProblem, problemsForPattern } = require('../services/practice/dsaBank');
const { subjectsFor } = require('../services/journey/templates');
const { journeyNow } = require('../services/journey/clock');
const { isOpen, formatDate } = require('../services/journey/planService');
const { loadPersona, listPersonas } = require('../services/journey/demoPersonas');
const { demoEnabled } = require('./journeyController');

const DAY_MS = 24 * 60 * 60 * 1000;
const NUDGE_EVERY_MS = 12 * 60 * 60 * 1000;
const MAX_QUESTIONS = 20;

function publicMentor(mentor) {
  return mentor ? { id: String(mentor._id), name: mentor.name, department: mentor.department, email: mentor.email } : null;
}

function viewerOf(req) {
  return { type: 'mentor', id: req.user._id };
}

function cleanText(value, max) {
  return String(value || '').trim().slice(0, max);
}

// ─── Account ────────────────────────────────────────────────────────────────

// GET /api/mentor/me
exports.getMe = async (req, res) => {
  try {
    const mentor = req.user.role === 'mentor' ? req.user : null;
    res.json({ success: true, mentor: publicMentor(mentor), accountRole: req.user.role, demoEnabled: demoEnabled() });
  } catch (error) {
    console.error('[mentor] me error:', error);
    res.status(500).json({ message: 'Failed to load mentor profile' });
  }
};

// POST /api/mentor/register  { name, department }
exports.register = async (req, res) => {
  try {
    if (req.user.role === 'mentor') return res.json({ success: true, mentor: publicMentor(req.user) });
    // A student account becomes faculty only when the person confirms it; their
    // student data is kept but the account opens the faculty area from now on
    if (req.user.role === 'candidate' && !(req.body && req.body.convert === true)) {
      return res.status(409).json({ code: 'student_account', message: 'This account is a student account. Confirm to turn it into a faculty account.' });
    }
    if (!['new', 'candidate'].includes(req.user.role)) {
      return res.status(409).json({ message: 'This account cannot register as faculty.' });
    }
    const name = cleanText(req.body && req.body.name, 100);
    const department = cleanText(req.body && req.body.department, 100);
    if (!name) return res.status(400).json({ message: 'Enter your name' });

    // `code` is the old per-mentor link code; still generated because the
    // collection has a unique index on it. Students now join classes instead.
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const mentor = await Mentor.create({
          clerkId: req.clerkId,
          name,
          department,
          email: req.clerkEmail || (req.user.role === 'candidate' ? req.user.email : '') || '',
          code: makeMentorCode(),
        });
        return res.status(201).json({ success: true, mentor: publicMentor(mentor), redirectUrl: '/mentor' });
      } catch (err) {
        if (!(err && err.code === 11000 && err.keyPattern && err.keyPattern.code)) throw err;
      }
    }
    res.status(500).json({ message: 'Could not register, please try again' });
  } catch (error) {
    console.error('[mentor] register error:', error);
    res.status(500).json({ message: 'Failed to register as mentor' });
  }
};

// PATCH /api/mentor/me  { name, department }
exports.updateMe = async (req, res) => {
  try {
    const name = cleanText(req.body && req.body.name, 100);
    if (name) req.user.name = name;
    if (req.body && req.body.department !== undefined) req.user.department = cleanText(req.body.department, 100);
    await req.user.save();
    res.json({ success: true, mentor: publicMentor(req.user) });
  } catch (error) {
    console.error('[mentor] update me error:', error);
    res.status(500).json({ message: 'Failed to save' });
  }
};

// ─── Classes ────────────────────────────────────────────────────────────────

async function loadClass(req) {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) return null;
  return Classroom.findOne({ _id: req.params.id, mentor: req.user._id });
}

function classFields(body, { partial = false } = {}) {
  const data = {};
  ['name', 'section', 'subject'].forEach((key) => {
    if (body[key] !== undefined) data[key] = cleanText(body[key], 100);
  });
  if (body.description !== undefined) data.description = cleanText(body.description, 1000);
  if (body.theme !== undefined) {
    const theme = Number(body.theme);
    if (Number.isInteger(theme) && theme >= 0 && theme <= 5) data.theme = theme;
  }
  if (!partial || data.name !== undefined) {
    if (!data.name) return { error: 'Give the class a name' };
  }
  return { data };
}

// GET /api/mentor/classes
exports.listClasses = async (req, res) => {
  try {
    const list = await Classroom.find({ mentor: req.user._id }).sort({ archived: 1, createdAt: -1 }).lean();
    const ids = list.map((c) => c._id);
    const [memberCounts, workCounts, toReview] = await Promise.all([
      ClassMember.aggregate([{ $match: { classroom: { $in: ids } } }, { $group: { _id: '$classroom', n: { $sum: 1 } } }]),
      Assignment.aggregate([{ $match: { classroom: { $in: ids } } }, { $group: { _id: '$classroom', n: { $sum: 1 } } }]),
      Submission.aggregate([
        { $match: { classroom: { $in: ids }, turnedInAt: { $ne: null }, returnedAt: null } },
        { $lookup: { from: 'assignments', localField: 'assignment', foreignField: '_id', as: 'a' } },
        { $match: { 'a.type': 'task' } },
        { $group: { _id: '$classroom', n: { $sum: 1 } } },
      ]),
    ]);
    const count = (rows, id) => (rows.find((r) => String(r._id) === String(id)) || { n: 0 }).n;

    res.json({
      success: true,
      mentor: publicMentor(req.user),
      demoEnabled: demoEnabled(),
      classes: list.map((c) => ({
        ...classrooms.publicClassroom(c, { forMentor: true }),
        students: count(memberCounts, c._id),
        classwork: count(workCounts, c._id),
        toReview: count(toReview, c._id),
      })),
    });
  } catch (error) {
    console.error('[mentor] classes error:', error);
    res.status(500).json({ message: 'Failed to load classes' });
  }
};

// POST /api/mentor/classes
exports.createClass = async (req, res) => {
  try {
    const { data, error } = classFields(req.body || {});
    if (error) return res.status(400).json({ message: error });
    const classroom = await classrooms.createWithCode({ ...data, mentor: req.user._id });
    res.status(201).json({ success: true, classroom: classrooms.publicClassroom(classroom, { forMentor: true }) });
  } catch (error) {
    console.error('[mentor] create class error:', error);
    res.status(500).json({ message: 'Failed to create the class' });
  }
};

// PATCH /api/mentor/classes/:id  { name, section, subject, description, theme, joinOpen, archived }
exports.updateClass = async (req, res) => {
  try {
    const classroom = await loadClass(req);
    if (!classroom) return res.status(404).json({ message: 'Class not found' });
    const { data, error } = classFields(req.body || {}, { partial: true });
    if (error) return res.status(400).json({ message: error });
    Object.assign(classroom, data);
    if (typeof req.body.joinOpen === 'boolean') classroom.joinOpen = req.body.joinOpen;
    if (typeof req.body.archived === 'boolean') classroom.archived = req.body.archived;
    await classroom.save();
    res.json({ success: true, classroom: classrooms.publicClassroom(classroom, { forMentor: true }) });
  } catch (error) {
    console.error('[mentor] update class error:', error);
    res.status(500).json({ message: 'Failed to save the class' });
  }
};

// POST /api/mentor/classes/:id/code  (new join code; the old one stops working)
exports.resetCode = async (req, res) => {
  try {
    const classroom = await loadClass(req);
    if (!classroom) return res.status(404).json({ message: 'Class not found' });
    await classrooms.regenerateCode(classroom);
    res.json({ success: true, code: classroom.code });
  } catch (error) {
    console.error('[mentor] reset code error:', error);
    res.status(500).json({ message: 'Failed to make a new code' });
  }
};

// DELETE /api/mentor/classes/:id  (archived classes only)
exports.deleteClass = async (req, res) => {
  try {
    const classroom = await loadClass(req);
    if (!classroom) return res.status(404).json({ message: 'Class not found' });
    if (!classroom.archived) return res.status(400).json({ message: 'Archive the class before deleting it' });

    const open = await Submission.find({ classroom: classroom._id, completedAt: null }).lean();
    const byStudent = {};
    open.forEach((s) => (byStudent[String(s.candidate)] = byStudent[String(s.candidate)] || []).push(s));
    for (const [candidateId, list] of Object.entries(byStudent)) {
      await classrooms.dropFromPlan(candidateId, list, `${classroom.name} was closed by your mentor, so its open work was taken off your plan.`);
    }
    await Promise.all([
      ClassMember.deleteMany({ classroom: classroom._id }),
      ClassPost.deleteMany({ classroom: classroom._id }),
      Assignment.deleteMany({ classroom: classroom._id }),
      Submission.deleteMany({ classroom: classroom._id }),
    ]);
    await classroom.deleteOne();
    res.json({ success: true });
  } catch (error) {
    console.error('[mentor] delete class error:', error);
    res.status(500).json({ message: 'Failed to delete the class' });
  }
};

/** Members with names, and every member's classwork brought up to date. */
async function rosterWithWork(classroom) {
  const members = await ClassMember.find({ classroom: classroom._id }).sort({ joinedAt: 1 }).lean();
  const candidates = await Candidate.find({ _id: { $in: members.map((m) => m.candidate) } }).select('firstName lastName email').lean();
  const byId = Object.fromEntries(candidates.map((c) => [String(c._id), c]));
  const synced = await Promise.all(members.map((m) => classrooms.syncStudent(m.candidate, { classroomId: classroom._id })));
  return members
    .filter((m) => byId[String(m.candidate)])
    .map((m) => ({
      member: m,
      candidate: byId[String(m.candidate)],
      results: synced[members.indexOf(m)] || [],
    }));
}

// GET /api/mentor/classes/:id
exports.getClass = async (req, res) => {
  try {
    const classroom = await loadClass(req);
    if (!classroom) return res.status(404).json({ message: 'Class not found' });

    const [roster, posts, assignments] = await Promise.all([
      rosterWithWork(classroom),
      ClassPost.find({ classroom: classroom._id }).sort({ pinned: -1, createdAt: -1 }).limit(60).lean(),
      Assignment.find({ classroom: classroom._id }).sort({ createdAt: -1 }).lean(),
    ]);
    const summaries = await summariesFor(roster.map((r) => r.candidate._id));
    const summaryById = Object.fromEntries(summaries.map((s) => [s.candidateId, s]));

    const classwork = assignments.map((a) => {
      const statuses = roster.map((r) => {
        const found = r.results.find((x) => String(x.assignment._id) === String(a._id));
        return found ? found.status : classrooms.statusOf(a, null);
      });
      const toReview = a.type === 'task'
        ? roster.filter((r) => {
          const found = r.results.find((x) => String(x.assignment._id) === String(a._id));
          return found && found.submission.turnedInAt && !found.submission.returnedAt;
        }).length
        : 0;
      return {
        ...classrooms.publicAssignment(a, { forMentor: true }),
        counts: {
          total: statuses.length,
          done: statuses.filter((s) => classrooms.DONE_STATUSES.includes(s)).length,
          missing: statuses.filter((s) => s === 'missing').length,
          inProgress: statuses.filter((s) => s === 'in_progress').length,
          toReview,
        },
      };
    });

    const assignmentsById = Object.fromEntries(assignments.map((a) => [String(a._id), a]));
    const board = classrooms.leaderboard(
      roster.map((r) => ({ candidateId: String(r.candidate._id), name: displayName(r.candidate), submissions: r.results.map((x) => x.submission) })),
      assignmentsById
    );

    res.json({
      success: true,
      classroom: classrooms.publicClassroom(classroom, { forMentor: true }),
      posts: posts.map((p) => classrooms.publicPost(p, viewerOf(req))),
      classwork,
      students: roster.map((r) => {
        const s = summaryById[String(r.candidate._id)];
        const pending = r.results.filter((x) => !classrooms.DONE_STATUSES.includes(x.status));
        return {
          candidateId: String(r.candidate._id),
          name: displayName(r.candidate),
          email: r.candidate.email,
          joinedAt: r.member.joinedAt,
          hasJourney: !!s,
          summary: s || null,
          classwork: {
            done: r.results.length - pending.length,
            missing: pending.filter((x) => x.status === 'missing').length,
            total: r.results.length,
          },
        };
      }),
      leaderboard: board,
    });
  } catch (error) {
    console.error('[mentor] class error:', error);
    res.status(500).json({ message: 'Failed to load the class' });
  }
};

// DELETE /api/mentor/classes/:id/members/:candidateId
exports.removeMember = async (req, res) => {
  try {
    const classroom = await loadClass(req);
    if (!classroom) return res.status(404).json({ message: 'Class not found' });
    if (!mongoose.Types.ObjectId.isValid(req.params.candidateId)) return res.status(404).json({ message: 'Student not found' });
    const member = await ClassMember.findOne({ classroom: classroom._id, candidate: req.params.candidateId });
    if (!member) return res.status(404).json({ message: 'Student not found' });
    const open = await Submission.find({ classroom: classroom._id, candidate: member.candidate, completedAt: null }).lean();
    await classrooms.dropFromPlan(member.candidate, open, `You were removed from ${classroom.name}, so its open work was taken off your plan.`);
    await member.deleteOne();
    res.json({ success: true });
  } catch (error) {
    console.error('[mentor] remove member error:', error);
    res.status(500).json({ message: 'Failed to remove the student' });
  }
};

// ─── Stream ─────────────────────────────────────────────────────────────────

// POST /api/mentor/classes/:id/posts  { text, pinned }
exports.createPost = async (req, res) => {
  try {
    const classroom = await loadClass(req);
    if (!classroom) return res.status(404).json({ message: 'Class not found' });
    const text = cleanText(req.body && req.body.text, 2000);
    if (!text) return res.status(400).json({ message: 'Write something first' });
    const post = await ClassPost.create({
      classroom: classroom._id,
      kind: 'announcement',
      authorType: 'mentor',
      author: req.user._id,
      authorName: req.user.name,
      text,
      pinned: !!(req.body && req.body.pinned),
    });
    res.status(201).json({ success: true, post: classrooms.publicPost(post.toObject(), viewerOf(req)) });
  } catch (error) {
    console.error('[mentor] post error:', error);
    res.status(500).json({ message: 'Failed to post' });
  }
};

async function loadPost(req, classroom) {
  if (!mongoose.Types.ObjectId.isValid(req.params.postId)) return null;
  return ClassPost.findOne({ _id: req.params.postId, classroom: classroom._id });
}

// PATCH /api/mentor/classes/:id/posts/:postId  { pinned }
exports.updatePost = async (req, res) => {
  try {
    const classroom = await loadClass(req);
    if (!classroom) return res.status(404).json({ message: 'Class not found' });
    const post = await loadPost(req, classroom);
    if (!post) return res.status(404).json({ message: 'Post not found' });
    if (typeof req.body.pinned === 'boolean') post.pinned = req.body.pinned;
    await post.save();
    res.json({ success: true, post: classrooms.publicPost(post.toObject(), viewerOf(req)) });
  } catch (error) {
    console.error('[mentor] update post error:', error);
    res.status(500).json({ message: 'Failed to update the post' });
  }
};

// DELETE /api/mentor/classes/:id/posts/:postId  (any post in the mentor's class)
exports.deletePost = async (req, res) => {
  try {
    const classroom = await loadClass(req);
    if (!classroom) return res.status(404).json({ message: 'Class not found' });
    const post = await loadPost(req, classroom);
    if (!post) return res.status(404).json({ message: 'Post not found' });
    await post.deleteOne();
    res.json({ success: true });
  } catch (error) {
    console.error('[mentor] delete post error:', error);
    res.status(500).json({ message: 'Failed to delete the post' });
  }
};

// POST /api/mentor/classes/:id/posts/:postId/comments  { text }
exports.addComment = async (req, res) => {
  try {
    const classroom = await loadClass(req);
    if (!classroom) return res.status(404).json({ message: 'Class not found' });
    const post = await loadPost(req, classroom);
    if (!post) return res.status(404).json({ message: 'Post not found' });
    const text = cleanText(req.body && req.body.text, 1000);
    if (!text) return res.status(400).json({ message: 'Write a comment first' });
    if (post.comments.length >= 200) return res.status(400).json({ message: 'This thread is full' });
    post.comments.push({ authorType: 'mentor', author: req.user._id, authorName: req.user.name, text });
    await post.save();
    res.status(201).json({ success: true, post: classrooms.publicPost(post.toObject(), viewerOf(req)) });
  } catch (error) {
    console.error('[mentor] comment error:', error);
    res.status(500).json({ message: 'Failed to comment' });
  }
};

// ─── Classwork ──────────────────────────────────────────────────────────────

function normalizeQuestions(list) {
  return (Array.isArray(list) ? list : [])
    .slice(0, MAX_QUESTIONS)
    .map((q) => {
      const prompt = cleanText(q && q.prompt, 600);
      const options = (Array.isArray(q && q.options) ? q.options : []).map((o) => cleanText(o, 200)).filter(Boolean).slice(0, 6);
      const answerIndex = Number(q && q.answerIndex);
      if (!prompt || options.length < 2 || !Number.isInteger(answerIndex) || answerIndex < 0 || answerIndex >= options.length) return null;
      return { prompt, options, answerIndex, explanation: cleanText(q.explanation, 600) };
    });
}

/** Check and clean an assignment from the form. Returns { data } or { error }. */
function assignmentFields(body, existingType = null) {
  const type = existingType || body.type;
  if (!Assignment.TYPES.includes(type)) return { error: 'Choose what kind of work this is' };
  const title = cleanText(body.title, 120);
  if (!title) return { error: 'Give the work a title' };

  const raw = body.target || {};
  const target = { slugs: [], pattern: '', level: 0, subject: '', role: '', minScore: 0 };
  const minScore = Math.round(Number(raw.minScore));
  const score = Number.isFinite(minScore) ? Math.max(0, Math.min(100, minScore)) : null;

  switch (type) {
    case 'dsa_problems': {
      const slugs = [...new Set((Array.isArray(raw.slugs) ? raw.slugs : []).map(String))].filter((s) => getProblem(s)).slice(0, 15);
      if (!slugs.length) return { error: 'Pick at least one problem' };
      target.slugs = slugs;
      break;
    }
    case 'dsa_pattern': {
      if (!PATTERNS.some((p) => p.key === raw.pattern)) return { error: 'Pick a pattern' };
      const level = Math.round(Number(raw.level));
      if (!Number.isFinite(level) || level < 10 || level > 100) return { error: 'Target level must be between 10 and 100' };
      target.pattern = raw.pattern;
      target.level = level;
      break;
    }
    case 'lab_subject': {
      target.subject = cleanText(raw.subject, 100);
      if (!target.subject) return { error: 'Name the subject' };
      if (score === null) return { error: 'Set a pass score' };
      target.minScore = score;
      break;
    }
    case 'mock_interview':
    case 'resume':
      if (score === null) return { error: 'Set a pass score' };
      target.minScore = score;
      if (type === 'mock_interview') target.role = cleanText(raw.role, 100);
      break;
    default:
      break;
  }

  let questions = [];
  if (type === 'quiz') {
    const cleaned = normalizeQuestions(body.questions);
    if (!cleaned.length) return { error: 'Add at least one question' };
    const bad = cleaned.findIndex((q) => !q);
    if (bad >= 0) return { error: `Question ${bad + 1} needs text, at least two options and a correct answer` };
    questions = cleaned;
  }

  let dueAt = null;
  if (body.dueAt) {
    dueAt = new Date(body.dueAt);
    if (Number.isNaN(dueAt.getTime())) return { error: 'Due date is not valid' };
  }
  const points = Math.round(Number(body.points));

  return {
    data: {
      type,
      title,
      instructions: cleanText(body.instructions, 2000),
      target,
      questions,
      points: Number.isFinite(points) && points >= 0 && points <= 1000 ? points : 100,
      dueAt,
    },
  };
}

// POST /api/mentor/classes/:id/assignments
exports.createAssignment = async (req, res) => {
  try {
    const classroom = await loadClass(req);
    if (!classroom) return res.status(404).json({ message: 'Class not found' });
    if (classroom.archived) return res.status(400).json({ message: 'This class is archived' });
    const { data, error } = assignmentFields(req.body || {});
    if (error) return res.status(400).json({ message: error });

    const assignment = await Assignment.create({ ...data, classroom: classroom._id, mentor: req.user._id });
    await ClassPost.create({
      classroom: classroom._id,
      kind: 'assignment',
      authorType: 'mentor',
      author: req.user._id,
      authorName: req.user.name,
      text: `New ${classrooms.TYPE_LABELS[assignment.type].toLowerCase()}: ${assignment.title}${assignment.dueAt ? `, due ${formatDate(assignment.dueAt)}` : ''}.`,
      assignment: assignment._id,
    });

    // Put it in every student's plan right away, not on their next visit
    const members = await ClassMember.find({ classroom: classroom._id }).select('candidate').lean();
    await Promise.all(members.map((m) => classrooms.syncStudent(m.candidate, { classroomId: classroom._id })));

    res.status(201).json({ success: true, assignment: classrooms.publicAssignment(assignment, { forMentor: true }) });
  } catch (error) {
    console.error('[mentor] create assignment error:', error);
    res.status(500).json({ message: 'Failed to set the work' });
  }
};

async function loadAssignment(req, classroom) {
  if (!mongoose.Types.ObjectId.isValid(req.params.assignmentId)) return null;
  return Assignment.findOne({ _id: req.params.assignmentId, classroom: classroom._id });
}

// PATCH /api/mentor/classes/:id/assignments/:assignmentId  (type cannot change)
exports.updateAssignment = async (req, res) => {
  try {
    const classroom = await loadClass(req);
    if (!classroom) return res.status(404).json({ message: 'Class not found' });
    const assignment = await loadAssignment(req, classroom);
    if (!assignment) return res.status(404).json({ message: 'Classwork not found' });

    const { data, error } = assignmentFields(req.body || {}, assignment.type);
    if (error) return res.status(400).json({ message: error });
    if (assignment.type === 'quiz') {
      const taken = await Submission.exists({ assignment: assignment._id, score: { $ne: null } });
      if (taken && JSON.stringify(data.questions) !== JSON.stringify(assignment.questions.map((q) => ({ prompt: q.prompt, options: q.options, answerIndex: q.answerIndex, explanation: q.explanation })))) {
        return res.status(400).json({ message: 'Students have already taken this quiz, so its questions cannot change' });
      }
    }
    Object.assign(assignment, data);
    await assignment.save();
    await classrooms.updatePlans(assignment, classroom);
    res.json({ success: true, assignment: classrooms.publicAssignment(assignment, { forMentor: true }) });
  } catch (error) {
    console.error('[mentor] update assignment error:', error);
    res.status(500).json({ message: 'Failed to save the work' });
  }
};

// DELETE /api/mentor/classes/:id/assignments/:assignmentId
exports.deleteAssignment = async (req, res) => {
  try {
    const classroom = await loadClass(req);
    if (!classroom) return res.status(404).json({ message: 'Class not found' });
    const assignment = await loadAssignment(req, classroom);
    if (!assignment) return res.status(404).json({ message: 'Classwork not found' });

    const open = await Submission.find({ assignment: assignment._id, completedAt: null }).lean();
    for (const s of open) {
      await classrooms.dropFromPlan(s.candidate, [s], `Your mentor removed "${assignment.title}" from ${classroom.name}.`);
    }
    await Promise.all([
      Submission.deleteMany({ assignment: assignment._id }),
      ClassPost.deleteMany({ assignment: assignment._id }),
    ]);
    await assignment.deleteOne();
    res.json({ success: true });
  } catch (error) {
    console.error('[mentor] delete assignment error:', error);
    res.status(500).json({ message: 'Failed to delete the work' });
  }
};

// GET /api/mentor/classes/:id/assignments/:assignmentId  (grading table)
exports.getAssignment = async (req, res) => {
  try {
    const classroom = await loadClass(req);
    if (!classroom) return res.status(404).json({ message: 'Class not found' });
    const assignment = await loadAssignment(req, classroom);
    if (!assignment) return res.status(404).json({ message: 'Classwork not found' });

    const roster = await rosterWithWork(classroom);
    const rows = roster.map((r) => {
      const found = r.results.find((x) => String(x.assignment._id) === String(assignment._id));
      return {
        candidateId: String(r.candidate._id),
        name: displayName(r.candidate),
        ...classrooms.publicSubmission(found ? found.submission : null, assignment),
        answers: assignment.type === 'quiz' && found ? found.submission.answers || [] : [],
      };
    });

    // Per-question results so the mentor sees which questions the class got wrong
    let questionStats = [];
    if (assignment.type === 'quiz') {
      const taken = rows.filter((r) => typeof r.score === 'number');
      questionStats = assignment.questions.map((q, i) => ({
        index: i,
        prompt: q.prompt,
        correct: taken.filter((r) => r.answers[i] === q.answerIndex).length,
        answered: taken.length,
      }));
    }

    res.json({
      success: true,
      classroom: classrooms.publicClassroom(classroom, { forMentor: true }),
      assignment: { ...classrooms.publicAssignment(assignment, { forMentor: true }), lastNudgedAt: assignment.lastNudgedAt },
      submissions: rows.sort((a, b) => a.name.localeCompare(b.name)),
      questionStats,
    });
  } catch (error) {
    console.error('[mentor] assignment error:', error);
    res.status(500).json({ message: 'Failed to load the work' });
  }
};

// PUT /api/mentor/classes/:id/assignments/:assignmentId/submissions/:candidateId  { grade, feedback }
exports.gradeSubmission = async (req, res) => {
  try {
    const classroom = await loadClass(req);
    if (!classroom) return res.status(404).json({ message: 'Class not found' });
    const assignment = await loadAssignment(req, classroom);
    if (!assignment) return res.status(404).json({ message: 'Classwork not found' });
    if (!mongoose.Types.ObjectId.isValid(req.params.candidateId)) return res.status(404).json({ message: 'Student not found' });
    const isMember = await ClassMember.exists({ classroom: classroom._id, candidate: req.params.candidateId });
    if (!isMember) return res.status(404).json({ message: 'Student not found' });

    const submission = await Submission.findOne({ assignment: assignment._id, candidate: req.params.candidateId });
    if (!submission) return res.status(400).json({ message: 'Nothing to grade yet' });
    if (assignment.type === 'task' && !submission.turnedInAt) return res.status(400).json({ message: 'The student has not handed this in yet' });

    const body = req.body || {};
    if (body.grade !== undefined && body.grade !== null && body.grade !== '') {
      const grade = Number(body.grade);
      if (!Number.isFinite(grade) || grade < 0 || grade > assignment.points) {
        return res.status(400).json({ message: `Grade must be between 0 and ${assignment.points}` });
      }
      submission.grade = Math.round(grade * 10) / 10;
    }
    if (body.feedback !== undefined) submission.feedback = cleanText(body.feedback, 2000);
    if (!submission.completedAt && assignment.type === 'task') submission.completedAt = submission.turnedInAt;
    submission.returnedAt = new Date();
    await submission.save();

    // The student hears about it through their companion as well
    const candidate = await Candidate.findById(submission.candidate).select('clerkId').lean();
    if (candidate) {
      const grade = typeof submission.grade === 'number' ? ` Grade: ${submission.grade}/${assignment.points}.` : '';
      await CompanionMessage.create({
        candidate: submission.candidate,
        clerkId: candidate.clerkId,
        role: 'companion',
        kind: 'mentor',
        content: `${req.user.name} returned "${assignment.title}" in ${classroom.name}.${grade}${submission.feedback ? `\n\nFeedback: ${submission.feedback}` : ''}`,
      });
    }
    res.json({ success: true, submission: classrooms.publicSubmission(submission, assignment) });
  } catch (error) {
    console.error('[mentor] grade error:', error);
    res.status(500).json({ message: 'Failed to save the grade' });
  }
};

// POST /api/mentor/classes/:id/assignments/:assignmentId/nudge
// Reminds every student who has not finished, through their companion.
exports.nudge = async (req, res) => {
  try {
    const classroom = await loadClass(req);
    if (!classroom) return res.status(404).json({ message: 'Class not found' });
    const assignment = await loadAssignment(req, classroom);
    if (!assignment) return res.status(404).json({ message: 'Classwork not found' });
    const last = assignment.lastNudgedAt;
    if (last && Date.now() - new Date(last).getTime() < NUDGE_EVERY_MS) {
      return res.status(429).json({ message: 'You reminded this class in the last 12 hours' });
    }

    const roster = await rosterWithWork(classroom);
    const pending = roster.filter((r) => {
      const found = r.results.find((x) => String(x.assignment._id) === String(assignment._id));
      return !found || !classrooms.DONE_STATUSES.includes(found.status);
    });
    const due = assignment.dueAt ? ` It is due ${formatDate(assignment.dueAt)}.` : '';
    await Promise.all(pending.map((r) => CompanionMessage.create({
      candidate: r.candidate._id,
      clerkId: r.candidate.clerkId || r.member.clerkId,
      role: 'companion',
      kind: 'mentor',
      content: `Reminder from ${req.user.name}: "${assignment.title}" in ${classroom.name} is still open.${due} ${classrooms.describeTarget(assignment)}.`,
    })));
    assignment.lastNudgedAt = new Date();
    await assignment.save();
    res.json({ success: true, reminded: pending.length });
  } catch (error) {
    console.error('[mentor] nudge error:', error);
    res.status(500).json({ message: 'Failed to send reminders' });
  }
};

// POST /api/mentor/classes/:id/quiz-draft  { topic, count, level }
exports.draftQuiz = async (req, res) => {
  try {
    const classroom = await loadClass(req);
    if (!classroom) return res.status(404).json({ message: 'Class not found' });
    const topic = cleanText(req.body && req.body.topic, 200);
    if (!topic) return res.status(400).json({ message: 'Enter a topic' });
    const count = Math.max(3, Math.min(10, Math.round(Number(req.body.count)) || 5));
    const level = ['easy', 'medium', 'hard'].includes(req.body.level) ? req.body.level : 'medium';

    const prompt = `Write a multiple-choice quiz for engineering students.

CLASS: ${classroom.name}${classroom.subject ? `, subject ${classroom.subject}` : ''}${classroom.section ? ` (${classroom.section})` : ''}
TOPIC: ${topic}
DIFFICULTY: ${level} (university exam, GATE or placement test style)

Write exactly ${count} questions. Each has four options and exactly one correct answer, with plausible distractors.
Check every answer carefully; a wrong answer key is worse than an easy question.
Write maths as plain text (sqrt(x), x^2, a/b), never LaTeX.

Return JSON only:
{"questions": [{"prompt": "...", "options": ["...", "...", "...", "..."], "answerIndex": 0, "explanation": "why, 1-2 sentences"}]}`;

    let result;
    try {
      result = await generateJson(prompt);
    } catch (err) {
      console.error('[mentor] quiz draft AI error:', err.message);
      return res.status(503).json({ message: 'The question writer is busy. Try again in a minute, or write the questions yourself.' });
    }
    const questions = normalizeQuestions(result && result.questions).filter(Boolean);
    if (questions.length < 2) return res.status(503).json({ message: 'The question writer returned too few usable questions. Try again.' });
    res.json({ success: true, questions });
  } catch (error) {
    console.error('[mentor] quiz draft error:', error);
    res.status(500).json({ message: 'Failed to draft questions' });
  }
};

// GET /api/mentor/classes/:id/insights
exports.getInsights = async (req, res) => {
  try {
    const classroom = await loadClass(req);
    if (!classroom) return res.status(404).json({ message: 'Class not found' });
    const [roster, assignments] = await Promise.all([
      rosterWithWork(classroom),
      Assignment.find({ classroom: classroom._id }).sort({ createdAt: -1 }).lean(),
    ]);
    const summaries = await summariesFor(roster.map((r) => r.candidate._id));
    const work = assignments.map((a) => ({
      assignment: a,
      statuses: roster.map((r) => {
        const found = r.results.find((x) => String(x.assignment._id) === String(a._id));
        return found ? found.status : classrooms.statusOf(a, null);
      }),
    }));
    const insights = await classInsights(roster.map((r) => r.member), summaries, work);
    res.json({ success: true, insights });
  } catch (error) {
    console.error('[mentor] insights error:', error);
    res.status(500).json({ message: 'Failed to load insights' });
  }
};

// GET /api/mentor/catalog  (what the classwork form can pick from)
exports.getCatalog = async (req, res) => {
  try {
    const branches = ['Computer Engineering', 'Electronics', 'Electrical', 'Mechanical', 'Civil', 'Chemical'];
    const subjects = new Set();
    branches.forEach((b) => {
      const s = subjectsFor(b);
      [...s.foundation, ...s.core, s.advanced].forEach((name) => subjects.add(name));
    });
    ['Quantitative aptitude', 'Logical reasoning'].forEach((name) => subjects.add(name));

    res.json({
      success: true,
      patterns: PATTERNS.map((p) => ({
        key: p.key,
        name: p.name,
        problems: problemsForPattern(p.key).map((q) => ({ slug: q.slug, title: q.title, difficulty: q.difficulty })),
      })),
      problemCount: PROBLEMS.length,
      subjects: [...subjects],
    });
  } catch (error) {
    console.error('[mentor] catalog error:', error);
    res.status(500).json({ message: 'Failed to load the catalog' });
  }
};

// ─── One student ────────────────────────────────────────────────────────────

async function loadStudent(req) {
  if (!mongoose.Types.ObjectId.isValid(req.params.candidateId)) return { status: 404, message: 'Student not found' };
  // Only students in one of this mentor's classes are visible
  const classIds = (await Classroom.find({ mentor: req.user._id }).select('_id').lean()).map((c) => c._id);
  const member = await ClassMember.findOne({ classroom: { $in: classIds }, candidate: req.params.candidateId }).lean();
  if (!member) return { status: 404, message: 'Student not found' };

  const [candidate, profile, plan] = await Promise.all([
    Candidate.findById(req.params.candidateId).lean(),
    StudentProfile.findOne({ candidate: req.params.candidateId }),
    JourneyPlan.findOne({ candidate: req.params.candidateId }),
  ]);
  if (!candidate) return { status: 404, message: 'Student not found' };
  return { candidate, profile, plan, classIds };
}

// GET /api/mentor/students/:candidateId
exports.getStudent = async (req, res) => {
  try {
    const found = await loadStudent(req);
    if (found.status) return res.status(found.status).json({ message: found.message });
    const { candidate, profile, plan, classIds } = found;
    if (!profile || !plan) {
      return res.json({ success: true, summary: null, name: displayName(candidate), message: 'This student has not set up their journey yet.' });
    }

    const now = journeyNow(profile);
    const summary = await summarise(candidate, profile, plan);
    const open = plan.milestones.filter(isOpen).sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt));
    const [mistakes, submissions] = await Promise.all([
      PracticeAttempt.find({ candidate: candidate._id, passed: false, 'mistake.type': { $exists: true } })
        .sort({ occurredAt: -1 }).limit(6).select('title topic kind mistake occurredAt').lean(),
      Submission.find({ candidate: candidate._id, classroom: { $in: classIds } }).populate('assignment', 'title dueAt type points').lean(),
    ]);

    res.json({
      success: true,
      summary,
      upcoming: open.slice(0, 8).map((m) => ({
        id: String(m._id), title: m.title, dueAt: m.dueAt, overdue: new Date(m.dueAt) < now, status: m.status, origin: m.origin,
      })),
      changeLog: plan.changeLog.slice(-8).reverse().map((c) => ({ at: c.at, trigger: c.trigger, summary: c.summary })),
      skills: [...profile.skills].filter((s) => s.evidenceCount > 0).sort((a, b) => a.level - b.level).slice(0, 10)
        .map((s) => ({ name: s.name, level: s.level, evidenceCount: s.evidenceCount })),
      mistakes: mistakes.map((a) => ({ title: a.title, kind: a.kind, type: a.mistake.type, explanation: a.mistake.explanation, at: a.occurredAt })),
      exams: (profile.exams || []).filter((e) => new Date(e.endAt) >= now).map((e) => ({ title: e.title, startAt: e.startAt, endAt: e.endAt })),
      classwork: submissions.filter((s) => s.assignment).map((s) => ({
        title: s.assignment.title,
        status: classrooms.statusOf(s.assignment, s),
        grade: s.grade,
        points: s.assignment.points,
        progressLabel: s.progressLabel,
      })),
    });
  } catch (error) {
    console.error('[mentor] student error:', error);
    res.status(500).json({ message: 'Failed to load student' });
  }
};

// POST /api/mentor/students/:candidateId/note  { text }  (private, through the companion)
exports.sendNote = async (req, res) => {
  try {
    const text = cleanText(req.body && req.body.text, 1000);
    if (!text) return res.status(400).json({ message: 'Write a note first' });
    const found = await loadStudent(req);
    if (found.status) return res.status(found.status).json({ message: found.message });
    const { candidate, profile } = found;

    await CompanionMessage.create({
      candidate: candidate._id,
      clerkId: candidate.clerkId,
      role: 'companion',
      kind: 'mentor',
      content: `Note from your mentor ${req.user.name}:\n\n${text}`,
    });
    if (profile) {
      const now = journeyNow(profile);
      profile.memory.push({ text: `Mentor ${req.user.name} (${formatDate(now)}): ${text.slice(0, 220)}`, source: 'system', createdAt: now });
      if (profile.memory.length > 40) profile.memory.splice(0, profile.memory.length - 40);
      await profile.save();
    }
    res.json({ success: true });
  } catch (error) {
    console.error('[mentor] note error:', error);
    res.status(500).json({ message: 'Failed to send the note' });
  }
};

// ─── Demo ───────────────────────────────────────────────────────────────────

// POST /api/mentor/demo-class  (demo only): a filled class with three students
exports.createDemoClass = async (req, res) => {
  try {
    if (!demoEnabled()) return res.status(403).json({ message: 'Demo controls are disabled' });
    const mentor = req.user;

    const classroom = await classrooms.createWithCode({
      mentor: mentor._id,
      name: 'Placement Prep (demo)',
      section: 'Mixed years, all branches',
      subject: 'DSA, aptitude and interviews',
      description: 'A demo class filled with three sample students so you can try every feature.',
      theme: 2,
    });

    const names = { first_year_cs: ['Aarav', 'Mehta'], third_year_mech: ['Diya', 'Kulkarni'], final_year_ece: ['Kabir', 'Reddy'] };
    const students = [];
    for (const { key } of listPersonas()) {
      const clerkId = `demo-student-${mentor._id}-${key}`;
      const [firstName, lastName] = names[key] || ['Demo', 'Student'];
      const candidate = await Candidate.findOneAndUpdate(
        { clerkId },
        { $setOnInsert: { clerkId, email: `${key}.${mentor._id}@demo.skillup.local`, firstName, lastName, profileComplete: true } },
        { new: true, upsert: true }
      );
      await loadPersona(candidate, key);
      await ClassMember.updateOne(
        { classroom: classroom._id, candidate: candidate._id },
        { $setOnInsert: { classroom: classroom._id, candidate: candidate._id, clerkId, joinedAt: new Date(Date.now() - 20 * DAY_MS) } },
        { upsert: true }
      );
      students.push({ key, candidate });
    }

    const now = Date.now();
    const twoPointers = problemsForPattern('two_pointers').slice(0, 3).map((p) => p.slug);
    const specs = [
      { type: 'dsa_problems', title: 'Two Pointers warm-up', instructions: 'Solve all three in Practice. Try the hint ladder before searching online.', target: { slugs: twoPointers }, dueAt: new Date(now - 2 * DAY_MS), createdDaysAgo: 12 },
      { type: 'dsa_pattern', title: 'Get comfortable with Arrays and Hashing', instructions: 'Reach level 50 in Arrays and Hashing.', target: { pattern: 'arrays_hashing', level: 50 }, dueAt: new Date(now + 6 * DAY_MS), createdDaysAgo: 5 },
      { type: 'lab_subject', title: 'Aptitude check', instructions: 'Take one Quantitative aptitude set in Practice Lab.', target: { subject: 'Quantitative aptitude', minScore: 60 }, dueAt: new Date(now + 9 * DAY_MS), createdDaysAgo: 3 },
      {
        type: 'quiz', title: 'Complexity basics', instructions: 'Five quick questions. One attempt.', dueAt: new Date(now + 4 * DAY_MS), createdDaysAgo: 2,
        questions: [
          { prompt: 'What is the time complexity of binary search on a sorted array of n elements?', options: ['O(n)', 'O(log n)', 'O(n log n)', 'O(1)'], answerIndex: 1, explanation: 'Each step halves the search range.' },
          { prompt: 'Which structure gives average O(1) lookup by key?', options: ['Linked list', 'Hash map', 'Sorted array', 'Binary heap'], answerIndex: 1, explanation: 'Hashing maps a key straight to a bucket.' },
          { prompt: 'Two nested loops over the same array of size n take roughly:', options: ['O(n)', 'O(2n)', 'O(n^2)', 'O(log n)'], answerIndex: 2, explanation: 'n iterations inside n iterations.' },
          { prompt: 'Which pattern suits "longest substring without repeating characters"?', options: ['Sliding window', 'Binary search', 'Backtracking', 'Union find'], answerIndex: 0, explanation: 'A window grows and shrinks over a contiguous range.' },
          { prompt: 'A stack follows which order?', options: ['FIFO', 'LIFO', 'Sorted', 'Random'], answerIndex: 1, explanation: 'Last in, first out.' },
        ],
      },
      { type: 'task', title: 'Share your best project', instructions: 'Hand in a GitHub or drive link to the project you are proudest of, with two lines on what you built.', points: 20, dueAt: new Date(now + 7 * DAY_MS), createdDaysAgo: 4 },
    ];

    const created = [];
    for (const spec of specs) {
      const { createdDaysAgo, ...fields } = spec;
      const { data, error } = assignmentFields({ ...fields, points: fields.points ?? 100 });
      if (error) throw new Error(`Demo classwork invalid: ${error}`);
      const assignment = await Assignment.create({ ...data, classroom: classroom._id, mentor: mentor._id });
      const createdAt = new Date(now - createdDaysAgo * DAY_MS);
      await Assignment.collection.updateOne({ _id: assignment._id }, { $set: { createdAt } });
      await ClassPost.create({
        classroom: classroom._id, kind: 'assignment', authorType: 'mentor', author: mentor._id, authorName: mentor.name,
        text: `New ${classrooms.TYPE_LABELS[assignment.type].toLowerCase()}: ${assignment.title}${assignment.dueAt ? `, due ${formatDate(assignment.dueAt)}` : ''}.`,
        assignment: assignment._id,
      }).then((post) => ClassPost.collection.updateOne({ _id: post._id }, { $set: { createdAt } }));
      created.push(assignment);
    }

    const byKey = Object.fromEntries(students.map((s) => [s.key, s.candidate]));
    const quiz = created.find((a) => a.type === 'quiz');
    const task = created.find((a) => a.type === 'task');
    // Two students already took the quiz; one handed in the task
    const quizAnswers = { final_year_ece: [1, 1, 2, 0, 1], third_year_mech: [1, 0, 2, 2, 1] };
    for (const [key, answers] of Object.entries(quizAnswers)) {
      const correct = answers.filter((a, i) => a === quiz.questions[i].answerIndex).length;
      await Submission.create({
        assignment: quiz._id, classroom: classroom._id, candidate: byKey[key]._id,
        answers, score: Math.round((100 * correct) / quiz.questions.length), turnedInAt: new Date(now - DAY_MS),
      });
    }
    await Submission.create({
      assignment: task._id, classroom: classroom._id, candidate: byKey.final_year_ece._id,
      text: 'Smart attendance system on ESP32 with a Flask dashboard. I wrote the firmware and the REST API.',
      link: 'https://github.com/example/smart-attendance', turnedInAt: new Date(now - DAY_MS),
    });

    const welcome = await ClassPost.create({
      classroom: classroom._id, kind: 'announcement', authorType: 'mentor', author: mentor._id, authorName: mentor.name, pinned: true,
      text: 'Welcome! Classwork here is checked from your own practice on SkillUp, and each piece also appears in your journey plan. Ask doubts in the stream any time.',
    });
    await ClassPost.collection.updateOne({ _id: welcome._id }, { $set: { createdAt: new Date(now - 14 * DAY_MS) } });
    await ClassPost.create({
      classroom: classroom._id, kind: 'question', authorType: 'student', author: byKey.first_year_cs._id, authorName: 'Aarav Mehta',
      text: 'For the Two Pointers set, should we sort the array first even if the problem does not say it is sorted?',
      comments: [{ authorType: 'mentor', author: mentor._id, authorName: mentor.name, text: 'Only if the order of the output does not matter. Read the constraints, and note that sorting costs O(n log n).' }],
    });

    await Promise.all(students.map((s) => classrooms.syncStudent(s.candidate._id, { classroomId: classroom._id })));

    // One study squad with all three, so the squads view has something to show
    const { createSquad } = require('../services/grow/squads');
    const Squad = require('../models/Squad');
    await Squad.deleteMany({ members: { $in: students.map((s) => s.candidate._id) } });
    await createSquad({ name: 'Placement Prep (demo) squad 1', members: students.map((s) => s.candidate._id), classroom: classroom._id, focus: 'Formed by your mentor' });

    res.status(201).json({ success: true, classroom: classrooms.publicClassroom(classroom, { forMentor: true }) });
  } catch (error) {
    console.error('[mentor] demo class error:', error);
    res.status(500).json({ message: 'Failed to create the demo class' });
  }
};

// GET /api/mentor/classes/:id/dna  (the class's combined mistake fingerprint)
exports.getClassDna = async (req, res) => {
  try {
    const classroom = await loadClass(req);
    if (!classroom) return res.status(404).json({ message: 'Class not found' });
    const { mistakeDna } = require('../services/insightsService');
    const members = await ClassMember.find({ classroom: classroom._id }).select('candidate').lean();
    res.json({ success: true, result: await mistakeDna(members.map((m) => m.candidate)) });
  } catch (error) {
    console.error('[mentor] class dna error:', error);
    res.status(500).json({ message: 'Failed to load the class mistake DNA' });
  }
};
