// Student side of classrooms: join with a code, read the stream, do classwork.

const mongoose = require('mongoose');
const Classroom = require('../models/Classroom');
const ClassMember = require('../models/ClassMember');
const ClassPost = require('../models/ClassPost');
const Assignment = require('../models/Assignment');
const Submission = require('../models/Submission');
const Mentor = require('../models/Mentor');
const Candidate = require('../models/Candidate');
const {
  normalizeCode,
  syncStudent,
  dropFromPlan,
  publicAssignment,
  publicSubmission,
  publicClassroom,
  publicPost,
  leaderboard,
  DONE_STATUSES,
} = require('../services/classroomService');
const { displayName } = require('../services/mentorService');

const MAX_POSTS = 60;
const MAX_COMMENTS = 200;

function viewerOf(req) {
  return { type: 'student', id: req.user._id };
}

function cleanText(value, max) {
  return String(value || '').trim().slice(0, max);
}

/** The class, if this student is in it. */
async function loadMembership(req) {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) return null;
  const member = await ClassMember.findOne({ classroom: req.params.id, candidate: req.user._id }).lean();
  if (!member) return null;
  const classroom = await Classroom.findById(req.params.id).lean();
  return classroom ? { member, classroom } : null;
}

// GET /api/classes
exports.listClasses = async (req, res) => {
  try {
    const memberships = await ClassMember.find({ candidate: req.user._id }).lean();
    const classrooms = await Classroom.find({ _id: { $in: memberships.map((m) => m.classroom) } }).lean();
    const results = await syncStudent(req.user._id);
    const mentors = await Mentor.find({ _id: { $in: classrooms.map((c) => c.mentor) } }).select('name department').lean();
    const mentorById = Object.fromEntries(mentors.map((m) => [String(m._id), m]));

    const now = new Date();
    const classes = classrooms
      .map((classroom) => {
        const work = results.filter((r) => String(r.classroom._id) === String(classroom._id));
        const pending = work
          .filter((r) => !DONE_STATUSES.includes(r.status))
          .sort((a, b) => new Date(a.assignment.dueAt || 8.64e15) - new Date(b.assignment.dueAt || 8.64e15));
        const mentor = mentorById[String(classroom.mentor)];
        return {
          ...publicClassroom(classroom),
          mentorName: mentor ? mentor.name : 'Mentor',
          pending: pending.length,
          missing: pending.filter((r) => r.status === 'missing').length,
          next: pending[0]
            ? { id: String(pending[0].assignment._id), title: pending[0].assignment.title, dueAt: pending[0].assignment.dueAt, overdue: !!(pending[0].assignment.dueAt && new Date(pending[0].assignment.dueAt) < now) }
            : null,
        };
      })
      .sort((a, b) => Number(a.archived) - Number(b.archived) || a.name.localeCompare(b.name));

    res.json({ success: true, classes });
  } catch (error) {
    console.error('[classes] list error:', error);
    res.status(500).json({ message: 'Failed to load your classes' });
  }
};

// POST /api/classes/join  { code }
exports.joinClass = async (req, res) => {
  try {
    const code = normalizeCode(req.body && req.body.code);
    if (!code) return res.status(400).json({ message: 'Enter the class code your mentor shared' });

    const classroom = await Classroom.findOne({ code });
    if (!classroom || classroom.archived) return res.status(404).json({ message: 'No class has that code. Check it with your mentor.' });
    if (!classroom.joinOpen) return res.status(403).json({ message: 'This class is not taking new students right now. Ask your mentor to open it.' });

    const existing = await ClassMember.findOne({ classroom: classroom._id, candidate: req.user._id });
    if (!existing) {
      await ClassMember.create({ classroom: classroom._id, candidate: req.user._id, clerkId: req.clerkId });
    }
    await syncStudent(req.user._id, { classroomId: classroom._id });
    res.status(existing ? 200 : 201).json({ success: true, classId: String(classroom._id), alreadyJoined: !!existing });
  } catch (error) {
    if (error && error.code === 11000) return res.json({ success: true, alreadyJoined: true });
    console.error('[classes] join error:', error);
    res.status(500).json({ message: 'Failed to join the class' });
  }
};

// GET /api/classes/:id
exports.getClass = async (req, res) => {
  try {
    const found = await loadMembership(req);
    if (!found) return res.status(404).json({ message: 'Class not found' });
    const { classroom } = found;

    const results = await syncStudent(req.user._id, { classroomId: classroom._id });
    const [mentor, posts, members, assignments, allSubmissions] = await Promise.all([
      Mentor.findById(classroom.mentor).select('name department').lean(),
      ClassPost.find({ classroom: classroom._id }).sort({ pinned: -1, createdAt: -1 }).limit(MAX_POSTS).lean(),
      ClassMember.find({ classroom: classroom._id }).sort({ joinedAt: 1 }).lean(),
      Assignment.find({ classroom: classroom._id }).lean(),
      Submission.find({ classroom: classroom._id }).select('assignment candidate grade completedAt').lean(),
    ]);
    const candidates = await Candidate.find({ _id: { $in: members.map((m) => m.candidate) } }).select('firstName lastName email').lean();
    const nameOf = Object.fromEntries(candidates.map((c) => [String(c._id), displayName(c)]));

    const now = new Date();
    const classwork = results
      .map((r) => ({ ...publicAssignment(r.assignment), mine: publicSubmission(r.submission, r.assignment, now) }))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    const assignmentsById = Object.fromEntries(assignments.map((a) => [String(a._id), a]));
    const board = leaderboard(
      members.map((m) => ({
        candidateId: String(m.candidate),
        name: nameOf[String(m.candidate)] || 'Student',
        submissions: allSubmissions.filter((s) => String(s.candidate) === String(m.candidate)),
      })),
      assignmentsById
    ).map((row) => ({ ...row, me: row.candidateId === String(req.user._id) }));

    res.json({
      success: true,
      classroom: publicClassroom(classroom),
      mentor: mentor ? { name: mentor.name, department: mentor.department } : null,
      posts: posts.map((p) => publicPost(p, viewerOf(req))),
      classwork,
      people: members.map((m) => ({ name: nameOf[String(m.candidate)] || 'Student', me: String(m.candidate) === String(req.user._id) })),
      leaderboard: board,
    });
  } catch (error) {
    console.error('[classes] get error:', error);
    res.status(500).json({ message: 'Failed to load the class' });
  }
};

// DELETE /api/classes/:id/membership
exports.leaveClass = async (req, res) => {
  try {
    const found = await loadMembership(req);
    if (!found) return res.status(404).json({ message: 'Class not found' });
    const submissions = await Submission.find({ classroom: found.classroom._id, candidate: req.user._id, completedAt: null }).lean();
    await dropFromPlan(req.user._id, submissions, `You left ${found.classroom.name}, so its open work was taken off your plan.`);
    await ClassMember.deleteOne({ _id: found.member._id });
    res.json({ success: true });
  } catch (error) {
    console.error('[classes] leave error:', error);
    res.status(500).json({ message: 'Failed to leave the class' });
  }
};

// POST /api/classes/:id/posts  { text }  (a question to the class)
exports.createPost = async (req, res) => {
  try {
    const found = await loadMembership(req);
    if (!found || found.classroom.archived) return res.status(404).json({ message: 'Class not found' });
    const text = cleanText(req.body && req.body.text, 2000);
    if (!text) return res.status(400).json({ message: 'Write something first' });

    const post = await ClassPost.create({
      classroom: found.classroom._id,
      kind: 'question',
      authorType: 'student',
      author: req.user._id,
      authorName: displayName(req.user),
      text,
    });
    res.status(201).json({ success: true, post: publicPost(post.toObject(), viewerOf(req)) });
  } catch (error) {
    console.error('[classes] post error:', error);
    res.status(500).json({ message: 'Failed to post' });
  }
};

// POST /api/classes/:id/posts/:postId/comments  { text }
exports.addComment = async (req, res) => {
  try {
    const found = await loadMembership(req);
    if (!found || found.classroom.archived) return res.status(404).json({ message: 'Class not found' });
    const text = cleanText(req.body && req.body.text, 1000);
    if (!text) return res.status(400).json({ message: 'Write a comment first' });
    if (!mongoose.Types.ObjectId.isValid(req.params.postId)) return res.status(404).json({ message: 'Post not found' });

    const post = await ClassPost.findOne({ _id: req.params.postId, classroom: found.classroom._id });
    if (!post) return res.status(404).json({ message: 'Post not found' });
    if (post.comments.length >= MAX_COMMENTS) return res.status(400).json({ message: 'This thread is full' });
    post.comments.push({ authorType: 'student', author: req.user._id, authorName: displayName(req.user), text });
    await post.save();
    res.status(201).json({ success: true, post: publicPost(post.toObject(), viewerOf(req)) });
  } catch (error) {
    console.error('[classes] comment error:', error);
    res.status(500).json({ message: 'Failed to comment' });
  }
};

// DELETE /api/classes/:id/posts/:postId  (own question only)
exports.deletePost = async (req, res) => {
  try {
    const found = await loadMembership(req);
    if (!found) return res.status(404).json({ message: 'Class not found' });
    if (!mongoose.Types.ObjectId.isValid(req.params.postId)) return res.status(404).json({ message: 'Post not found' });
    const result = await ClassPost.deleteOne({
      _id: req.params.postId,
      classroom: found.classroom._id,
      authorType: 'student',
      author: req.user._id,
    });
    if (!result.deletedCount) return res.status(404).json({ message: 'Post not found' });
    res.json({ success: true });
  } catch (error) {
    console.error('[classes] delete post error:', error);
    res.status(500).json({ message: 'Failed to delete the post' });
  }
};

async function loadAssignment(req) {
  const found = await loadMembership(req);
  if (!found) return null;
  if (!mongoose.Types.ObjectId.isValid(req.params.assignmentId)) return null;
  const assignment = await Assignment.findOne({ _id: req.params.assignmentId, classroom: found.classroom._id }).lean();
  return assignment ? { ...found, assignment } : null;
}

function quizForStudent(assignment, submission) {
  const taken = submission && typeof submission.score === 'number';
  return (assignment.questions || []).map((q, index) => ({
    index,
    prompt: q.prompt,
    options: q.options,
    // Answers and explanations only after the student has handed the quiz in
    ...(taken ? { answerIndex: q.answerIndex, explanation: q.explanation, chosen: (submission.answers || [])[index] ?? null } : {}),
  }));
}

// GET /api/classes/:id/assignments/:assignmentId
exports.getAssignment = async (req, res) => {
  try {
    const found = await loadAssignment(req);
    if (!found) return res.status(404).json({ message: 'Classwork not found' });
    const results = await syncStudent(req.user._id, { classroomId: found.classroom._id });
    const mine = results.find((r) => String(r.assignment._id) === String(found.assignment._id));
    const submission = mine ? mine.submission : null;
    res.json({
      success: true,
      assignment: publicAssignment(found.assignment),
      mine: publicSubmission(submission, found.assignment),
      questions: found.assignment.type === 'quiz' ? quizForStudent(found.assignment, submission) : [],
    });
  } catch (error) {
    console.error('[classes] assignment error:', error);
    res.status(500).json({ message: 'Failed to load the classwork' });
  }
};

function cleanLink(value) {
  const link = cleanText(value, 500);
  if (!link) return '';
  try {
    const url = new URL(link);
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}

// POST /api/classes/:id/assignments/:assignmentId/submit
//   task: { text, link }   quiz: { answers: [optionIndex, ...] }
exports.submitAssignment = async (req, res) => {
  try {
    const found = await loadAssignment(req);
    if (!found || found.classroom.archived) return res.status(404).json({ message: 'Classwork not found' });
    const { assignment, classroom } = found;
    if (!['task', 'quiz'].includes(assignment.type)) {
      return res.status(400).json({ message: 'This work is checked automatically from your practice. Open it and do the work there.' });
    }

    let submission = await Submission.findOne({ assignment: assignment._id, candidate: req.user._id });
    if (!submission) submission = new Submission({ assignment: assignment._id, classroom: classroom._id, candidate: req.user._id });
    const now = new Date();

    if (assignment.type === 'task') {
      if (submission.returnedAt) return res.status(400).json({ message: 'Your mentor has already graded this' });
      const text = cleanText(req.body && req.body.text, 4000);
      const link = cleanLink(req.body && req.body.link);
      if (link === null) return res.status(400).json({ message: 'The link must start with http:// or https://' });
      if (!text && !link) return res.status(400).json({ message: 'Add a note or a link to hand in' });
      submission.text = text;
      submission.link = link;
      submission.turnedInAt = now;
    } else {
      if (typeof submission.score === 'number') return res.status(400).json({ message: 'You have already taken this quiz' });
      const questions = assignment.questions || [];
      const answers = Array.isArray(req.body && req.body.answers) ? req.body.answers : [];
      if (answers.length !== questions.length) return res.status(400).json({ message: 'Answer every question first' });
      const clean = answers.map((a, i) => {
        const n = Number(a);
        return Number.isInteger(n) && n >= 0 && n < questions[i].options.length ? n : -1;
      });
      if (clean.some((a) => a < 0)) return res.status(400).json({ message: 'Answer every question first' });
      const correct = clean.filter((a, i) => a === questions[i].answerIndex).length;
      submission.answers = clean;
      submission.score = Math.round((100 * correct) / Math.max(1, questions.length));
      submission.turnedInAt = now;
    }

    await submission.save();
    // The sync marks it complete, grades a quiz and ticks the plan milestone
    await syncStudent(req.user._id, { classroomId: classroom._id });
    const fresh = await Submission.findById(submission._id).lean();
    res.json({
      success: true,
      mine: publicSubmission(fresh, assignment),
      questions: assignment.type === 'quiz' ? quizForStudent(assignment, fresh) : [],
    });
  } catch (error) {
    console.error('[classes] submit error:', error);
    res.status(500).json({ message: 'Failed to hand in' });
  }
};

// POST /api/classes/:id/assignments/:assignmentId/unsubmit  (task, before grading)
exports.unsubmitAssignment = async (req, res) => {
  try {
    const found = await loadAssignment(req);
    if (!found) return res.status(404).json({ message: 'Classwork not found' });
    if (found.assignment.type !== 'task') return res.status(400).json({ message: 'Only tasks can be taken back' });
    const submission = await Submission.findOne({ assignment: found.assignment._id, candidate: req.user._id });
    if (!submission || !submission.turnedInAt) return res.status(400).json({ message: 'Nothing handed in yet' });
    if (submission.returnedAt) return res.status(400).json({ message: 'Your mentor has already graded this' });
    submission.turnedInAt = null;
    submission.completedAt = null;
    submission.grade = null;
    await submission.save();
    // The plan milestone stays done; reopening it would only confuse the change log
    res.json({ success: true, mine: publicSubmission(submission, found.assignment) });
  } catch (error) {
    console.error('[classes] unsubmit error:', error);
    res.status(500).json({ message: 'Failed to take it back' });
  }
};
