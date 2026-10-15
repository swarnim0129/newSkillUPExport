// Live class battle (Kahoot style), mentor squads and syllabus import.
// The battle has no sockets: the projector and phones poll one small state
// endpoint about every 1.5 seconds, and time is always taken from the server.

const mongoose = require('mongoose');
const Battle = require('../models/Battle');
const Classroom = require('../models/Classroom');
const ClassMember = require('../models/ClassMember');
const Assignment = require('../models/Assignment');
const Squad = require('../models/Squad');
const Candidate = require('../models/Candidate');
const ClassPost = require('../models/ClassPost');
const { summariesFor } = require('../services/mentorService');
const { createSquad, formGroups, describeSquad, displayName } = require('../services/grow/squads');
const { ALLOWED, readSyllabus } = require('../services/grow/snap');
const { syncStudent } = require('../services/classroomService');

const MAX_POINTS = 1000;

function clean(value, max) {
  return String(value || '').trim().slice(0, max);
}

async function mentorClass(req) {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) return null;
  return Classroom.findOne({ _id: req.params.id, mentor: req.user._id });
}

/** Move a timed-out question to "reveal" before anyone reads the state. */
async function settle(battle) {
  if (battle.status === 'question' && battle.questionStartedAt) {
    const elapsed = Date.now() - new Date(battle.questionStartedAt).getTime();
    if (elapsed >= battle.secondsPerQuestion * 1000) {
      battle.status = 'reveal';
      await battle.save();
    }
  }
  return battle;
}

function timeLeft(battle) {
  if (battle.status !== 'question' || !battle.questionStartedAt) return 0;
  return Math.max(0, Math.ceil(battle.secondsPerQuestion - (Date.now() - new Date(battle.questionStartedAt).getTime()) / 1000));
}

function standings(battle) {
  const totals = {};
  battle.players.forEach((p) => { totals[String(p.candidate)] = { candidateId: String(p.candidate), name: p.name, points: 0, correct: 0 }; });
  battle.answers.forEach((a) => {
    const row = totals[String(a.candidate)];
    if (!row) return;
    row.points += a.points || 0;
    if (a.correct) row.correct += 1;
  });
  return Object.values(totals).sort((a, b) => b.points - a.points || a.name.localeCompare(b.name)).map((r, i) => ({ ...r, rank: i + 1 }));
}

function battleState(battle, { forMentor = false, viewer = null } = {}) {
  const q = battle.current >= 0 ? battle.questions[battle.current] : null;
  const showAnswer = battle.status === 'reveal' || battle.status === 'ended' || forMentor;
  const answersNow = battle.answers.filter((a) => a.index === battle.current);
  const board = standings(battle);
  const mine = viewer ? answersNow.find((a) => String(a.candidate) === String(viewer)) : null;
  const meRow = viewer ? board.find((r) => r.candidateId === String(viewer)) : null;

  return {
    id: String(battle._id),
    title: battle.title,
    status: battle.status,
    current: battle.current,
    total: battle.questions.length,
    secondsPerQuestion: battle.secondsPerQuestion,
    timeLeft: timeLeft(battle),
    players: battle.players.length,
    joined: viewer ? battle.players.some((p) => String(p.candidate) === String(viewer)) : undefined,
    question: q
      ? {
        prompt: q.prompt,
        options: q.options,
        ...(showAnswer ? { answerIndex: q.answerIndex, explanation: q.explanation } : {}),
      }
      : null,
    answered: answersNow.length,
    // How many picked each option: shown to the mentor live, to students after the reveal
    distribution: q && (forMentor || showAnswer) ? q.options.map((_, i) => answersNow.filter((a) => a.choice === i).length) : null,
    mine: mine ? { choice: mine.choice, correct: showAnswer ? mine.correct : undefined, points: showAnswer ? mine.points : undefined } : null,
    me: meRow || null,
    leaderboard: forMentor || battle.status !== 'question' ? board.slice(0, forMentor ? 50 : 5) : [],
  };
}

function cleanQuestions(list) {
  return (Array.isArray(list) ? list : []).map((q) => {
    const options = (Array.isArray(q && q.options) ? q.options : []).map((o) => clean(o, 200)).filter(Boolean).slice(0, 4);
    const answerIndex = Number(q && q.answerIndex);
    if (!clean(q && q.prompt, 400) || options.length < 2 || !Number.isInteger(answerIndex) || answerIndex < 0 || answerIndex >= options.length) return null;
    return { prompt: clean(q.prompt, 400), options, answerIndex, explanation: clean(q.explanation, 400) };
  }).filter(Boolean).slice(0, 30);
}

// ─── Mentor: battle ─────────────────────────────────────────────────────────

// GET /api/mentor/classes/:id/battle  (current or most recent)
exports.mentorGetBattle = async (req, res) => {
  try {
    const classroom = await mentorClass(req);
    if (!classroom) return res.status(404).json({ message: 'Class not found' });
    const battle = await Battle.findOne({ classroom: classroom._id }).sort({ createdAt: -1 });
    if (!battle) return res.json({ success: true, battle: null });
    await settle(battle);
    res.json({ success: true, battle: battleState(battle, { forMentor: true }) });
  } catch (error) {
    console.error('[live] mentor get error:', error);
    res.status(500).json({ message: 'Could not load the battle' });
  }
};

// POST /api/mentor/classes/:id/battle  { title, assignmentId | questions, secondsPerQuestion }
exports.createBattle = async (req, res) => {
  try {
    const classroom = await mentorClass(req);
    if (!classroom) return res.status(404).json({ message: 'Class not found' });
    const body = req.body || {};
    let questions = [];
    let title = clean(body.title, 120);
    if (body.assignmentId && mongoose.Types.ObjectId.isValid(body.assignmentId)) {
      const quiz = await Assignment.findOne({ _id: body.assignmentId, classroom: classroom._id, type: 'quiz' }).lean();
      if (!quiz) return res.status(404).json({ message: 'Quiz not found in this class' });
      questions = cleanQuestions(quiz.questions);
      title = title || quiz.title;
    } else {
      questions = cleanQuestions(body.questions);
    }
    if (questions.length < 1) return res.status(400).json({ message: 'Add at least one question with a correct answer' });
    const seconds = Math.max(5, Math.min(120, Math.round(Number(body.secondsPerQuestion) || 20)));

    await Battle.updateMany({ classroom: classroom._id, status: { $ne: 'ended' } }, { $set: { status: 'ended', endedAt: new Date() } });
    const battle = await Battle.create({ classroom: classroom._id, mentor: req.user._id, title: title || 'Live quiz', questions, secondsPerQuestion: seconds });
    await ClassPost.create({
      classroom: classroom._id, kind: 'announcement', authorType: 'mentor', author: req.user._id, authorName: req.user.name, pinned: false,
      text: `Live battle "${battle.title}" is open. Go to the Live tab of this class to join.`,
    });
    res.status(201).json({ success: true, battle: battleState(battle, { forMentor: true }) });
  } catch (error) {
    console.error('[live] create error:', error);
    res.status(500).json({ message: 'Could not create the battle' });
  }
};

// POST /api/mentor/classes/:id/battle/:battleId/:action  (start | reveal | next | end)
exports.controlBattle = async (req, res) => {
  try {
    const classroom = await mentorClass(req);
    if (!classroom) return res.status(404).json({ message: 'Class not found' });
    if (!mongoose.Types.ObjectId.isValid(req.params.battleId)) return res.status(404).json({ message: 'Battle not found' });
    const battle = await Battle.findOne({ _id: req.params.battleId, classroom: classroom._id });
    if (!battle) return res.status(404).json({ message: 'Battle not found' });
    await settle(battle);

    const action = req.params.action;
    if (battle.status === 'ended') return res.status(400).json({ message: 'This battle has ended' });
    if (action === 'start' || action === 'next') {
      const next = battle.current + 1;
      if (next >= battle.questions.length) {
        battle.status = 'ended';
        battle.endedAt = new Date();
      } else {
        battle.current = next;
        battle.status = 'question';
        battle.questionStartedAt = new Date();
      }
    } else if (action === 'reveal') {
      if (battle.status === 'question') battle.status = 'reveal';
    } else if (action === 'end') {
      battle.status = 'ended';
      battle.endedAt = new Date();
    } else {
      return res.status(400).json({ message: 'Unknown action' });
    }
    await battle.save();
    res.json({ success: true, battle: battleState(battle, { forMentor: true }) });
  } catch (error) {
    console.error('[live] control error:', error);
    res.status(500).json({ message: 'Could not update the battle' });
  }
};

// ─── Student: battle ────────────────────────────────────────────────────────

async function studentBattle(req) {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) return { status: 404 };
  const member = await ClassMember.exists({ classroom: req.params.id, candidate: req.user._id });
  if (!member) return { status: 404 };
  // The running battle, or one that ended in the last 30 minutes (to see results)
  const battle = await Battle.findOne({
    classroom: req.params.id,
    $or: [{ status: { $ne: 'ended' } }, { endedAt: { $gte: new Date(Date.now() - 30 * 60000) } }],
  }).sort({ createdAt: -1 });
  return { battle };
}

// GET /api/classes/:id/battle
exports.studentGetBattle = async (req, res) => {
  try {
    const { status, battle } = await studentBattle(req);
    if (status) return res.status(status).json({ message: 'Class not found' });
    if (!battle) return res.json({ success: true, battle: null });
    await settle(battle);
    res.json({ success: true, battle: battleState(battle, { viewer: req.user._id }) });
  } catch (error) {
    console.error('[live] student get error:', error);
    res.status(500).json({ message: 'Could not load the battle' });
  }
};

// POST /api/classes/:id/battle/join
exports.joinBattle = async (req, res) => {
  try {
    const { status, battle } = await studentBattle(req);
    if (status || !battle) return res.status(404).json({ message: 'No live battle in this class right now' });
    if (battle.status === 'ended') return res.status(400).json({ message: 'This battle has ended' });
    if (!battle.players.some((p) => String(p.candidate) === String(req.user._id))) {
      await Battle.updateOne(
        { _id: battle._id, 'players.candidate': { $ne: req.user._id } },
        { $push: { players: { candidate: req.user._id, name: displayName(req.user), joinedAt: new Date() } } }
      );
    }
    const fresh = await settle(await Battle.findById(battle._id));
    res.json({ success: true, battle: battleState(fresh, { viewer: req.user._id }) });
  } catch (error) {
    console.error('[live] join error:', error);
    res.status(500).json({ message: 'Could not join' });
  }
};

// POST /api/classes/:id/battle/answer  { index, choice }
exports.answerBattle = async (req, res) => {
  try {
    const { status, battle } = await studentBattle(req);
    if (status || !battle) return res.status(404).json({ message: 'No live battle in this class right now' });
    await settle(battle);
    const index = Number(req.body && req.body.index);
    const choice = Number(req.body && req.body.choice);
    if (battle.status !== 'question' || index !== battle.current) return res.status(409).json({ message: 'Time is up for this question' });
    if (!battle.players.some((p) => String(p.candidate) === String(req.user._id))) return res.status(400).json({ message: 'Join the battle first' });
    const q = battle.questions[index];
    if (!Number.isInteger(choice) || choice < 0 || choice >= q.options.length) return res.status(400).json({ message: 'Pick an option' });

    const ms = Date.now() - new Date(battle.questionStartedAt).getTime();
    const correct = choice === q.answerIndex;
    // Correct answers earn 500, plus up to 500 more for speed
    const points = correct ? Math.round(MAX_POINTS / 2 + (MAX_POINTS / 2) * Math.max(0, 1 - ms / (battle.secondsPerQuestion * 1000))) : 0;
    // Atomic: one answer per student per question
    const result = await Battle.updateOne(
      { _id: battle._id, status: 'question', current: index, answers: { $not: { $elemMatch: { candidate: req.user._id, index } } } },
      { $push: { answers: { candidate: req.user._id, index, choice, correct, ms, points } } }
    );
    if (!result.modifiedCount) return res.status(409).json({ message: 'You already answered this one' });
    const fresh = await Battle.findById(battle._id);
    res.json({ success: true, battle: battleState(fresh, { viewer: req.user._id }) });
  } catch (error) {
    console.error('[live] answer error:', error);
    res.status(500).json({ message: 'Could not send your answer' });
  }
};

// ─── Mentor: squads ─────────────────────────────────────────────────────────

// GET /api/mentor/classes/:id/squads
exports.classSquads = async (req, res) => {
  try {
    const classroom = await mentorClass(req);
    if (!classroom) return res.status(404).json({ message: 'Class not found' });
    const list = await Squad.find({ classroom: classroom._id }).sort({ createdAt: 1 });
    res.json({ success: true, squads: await Promise.all(list.map((s) => describeSquad(s, null))) });
  } catch (error) {
    console.error('[live] squads error:', error);
    res.status(500).json({ message: 'Could not load squads' });
  }
};

// POST /api/mentor/classes/:id/squads  { size }  (replaces earlier class squads)
exports.formSquads = async (req, res) => {
  try {
    const classroom = await mentorClass(req);
    if (!classroom) return res.status(404).json({ message: 'Class not found' });
    const size = Math.max(2, Math.min(4, Math.round(Number(req.body && req.body.size) || 3)));
    const members = await ClassMember.find({ classroom: classroom._id }).lean();
    if (members.length < 2) return res.status(400).json({ message: 'You need at least two students in the class' });
    const summaries = await summariesFor(members.map((m) => m.candidate));
    const byId = Object.fromEntries(summaries.map((s) => [s.candidateId, s.readiness]));
    const candidates = await Candidate.find({ _id: { $in: members.map((m) => m.candidate) } }).select('firstName lastName').lean();
    const rows = candidates.map((c) => ({ id: c._id, name: displayName(c), readiness: byId[String(c._id)] ?? 0 }));
    const groups = formGroups(rows, size);

    await Squad.deleteMany({ classroom: classroom._id });
    const created = [];
    for (let i = 0; i < groups.length; i++) {
      created.push(await createSquad({
        name: `${classroom.name.slice(0, 40)} squad ${i + 1}`,
        members: groups[i].map((r) => r.id),
        classroom: classroom._id,
        focus: 'Formed by your mentor: strong and still-learning students together',
      }));
    }
    res.status(201).json({ success: true, squads: await Promise.all(created.map((s) => describeSquad(s, null))) });
  } catch (error) {
    console.error('[live] form squads error:', error);
    res.status(500).json({ message: 'Could not form squads' });
  }
};

// ─── Mentor: syllabus import ────────────────────────────────────────────────

// POST /api/mentor/classes/:id/syllabus  (multipart "file")  -> proposal to review
exports.readSyllabus = async (req, res) => {
  try {
    const classroom = await mentorClass(req);
    if (!classroom) return res.status(404).json({ message: 'Class not found' });
    if (!req.file) return res.status(400).json({ message: 'Choose a syllabus PDF or photo' });
    if (!ALLOWED.includes(req.file.mimetype)) return res.status(400).json({ message: 'Use a PDF, JPG, PNG or WEBP file' });
    try {
      const proposal = await readSyllabus(req.file, { className: classroom.name, weeks: Number(req.body && req.body.weeks) || 12 });
      if (!proposal.weeks.length) return res.status(422).json({ message: 'Could not find weekly topics in this file. Try a clearer page.' });
      res.json({ success: true, proposal });
    } catch (err) {
      console.warn('[syllabus] AI failed:', err.message);
      res.status(503).json({ message: 'Could not read the syllabus just now. Try again in a minute.' });
    }
  } catch (error) {
    console.error('[live] syllabus error:', error);
    res.status(500).json({ message: 'Could not read the syllabus' });
  }
};

// POST /api/mentor/classes/:id/syllabus/apply  { startDate, minScore, weeks: [{week, title, subject, topics}] }
exports.applySyllabus = async (req, res) => {
  try {
    const classroom = await mentorClass(req);
    if (!classroom) return res.status(404).json({ message: 'Class not found' });
    const weeks = (Array.isArray(req.body && req.body.weeks) ? req.body.weeks : []).slice(0, 20);
    if (!weeks.length) return res.status(400).json({ message: 'Pick at least one week' });
    const start = req.body.startDate ? new Date(req.body.startDate) : new Date();
    if (Number.isNaN(start.getTime())) return res.status(400).json({ message: 'Start date is not valid' });
    const minScore = Math.max(0, Math.min(100, Math.round(Number(req.body.minScore) || 60)));

    const created = [];
    for (const w of weeks) {
      const subject = clean(w.subject, 100);
      const title = clean(w.title, 100);
      if (!subject || !title) continue;
      const weekNo = Math.max(1, Math.round(Number(w.week) || created.length + 1));
      const dueAt = new Date(start.getTime() + weekNo * 7 * 86400000);
      dueAt.setHours(23, 59, 0, 0);
      const topics = (Array.isArray(w.topics) ? w.topics : []).map((t) => clean(t, 80)).filter(Boolean).slice(0, 6);
      created.push(await Assignment.create({
        classroom: classroom._id,
        mentor: req.user._id,
        type: 'lab_subject',
        title: `Week ${weekNo}: ${title}`.slice(0, 120),
        instructions: topics.length ? `Topics: ${topics.join(', ')}. Take a Practice Lab set in ${subject}.` : `Take a Practice Lab set in ${subject}.`,
        target: { subject, minScore, slugs: [], pattern: '', level: 0, role: '' },
        points: 100,
        dueAt,
      }));
    }
    if (!created.length) return res.status(400).json({ message: 'Nothing to create' });
    await ClassPost.create({
      classroom: classroom._id, kind: 'announcement', authorType: 'mentor', author: req.user._id, authorName: req.user.name,
      text: `The semester plan is set: ${created.length} weekly Practice Lab sets are now in Classwork and in your journey plans.`,
    });
    const members = await ClassMember.find({ classroom: classroom._id }).select('candidate').lean();
    await Promise.all(members.map((m) => syncStudent(m.candidate, { classroomId: classroom._id })));
    res.status(201).json({ success: true, created: created.length });
  } catch (error) {
    console.error('[live] apply syllabus error:', error);
    res.status(500).json({ message: 'Could not create the weekly work' });
  }
};
