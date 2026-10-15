const mongoose = require('mongoose');
const PracticeProgress = require('../models/PracticeProgress');
const PracticeAttempt = require('../models/PracticeAttempt');
const LabSet = require('../models/LabSet');
const SubjectProgress = require('../models/SubjectProgress');
const StudentProfile = require('../models/StudentProfile');
const JourneyPlan = require('../models/JourneyPlan');
const { HARNESS, getProblem, problemForStudent, patternName } = require('../services/practice/dsaBank');
const mastery = require('../services/practice/masteryService');
const { MISTAKE_LABELS, hintFor, classifyFailure, drillForRepeatedMistake } = require('../services/practice/coachService');
const lab = require('../services/practice/labService');
const { recordEvidence } = require('../services/evidenceService');
const { applyOps, logChange } = require('../services/journey/planService');
const { journeyNow } = require('../services/journey/clock');
const { extraLabSubjects } = require('../services/classroomService');

const MAX_CODE_CHARS = 20000;

// The practice clock follows the journey clock, so demo fast-forward also
// moves review dates. Students without a journey use real time.
async function clockFor(req) {
  const profile = await StudentProfile.findOne({ candidate: req.user._id });
  return { profile, now: profile ? journeyNow(profile) : new Date() };
}

function cleanCode(value) {
  return String(value || '').slice(0, MAX_CODE_CHARS);
}

async function journalSummary(candidateId, now) {
  const since = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
  const recent = await PracticeAttempt.find({ candidate: candidateId, passed: false, 'mistake.type': { $exists: true } })
    .sort({ occurredAt: -1 })
    .limit(40)
    .select('kind ref topic title mistake drillAdded occurredAt')
    .lean();

  const counts = {};
  recent
    .filter((a) => new Date(a.occurredAt) >= since)
    .forEach((a) => {
      counts[a.mistake.type] = (counts[a.mistake.type] || 0) + 1;
    });

  return {
    counts: Object.entries(counts)
      .map(([type, count]) => ({ type, label: MISTAKE_LABELS[type] || type, count }))
      .sort((a, b) => b.count - a.count),
    entries: recent.slice(0, 15).map((a) => ({
      id: String(a._id),
      kind: a.kind,
      ref: a.ref,
      title: a.title,
      topic: a.kind === 'dsa' ? patternName(a.topic) : a.topic,
      type: a.mistake.type,
      label: MISTAKE_LABELS[a.mistake.type] || a.mistake.type,
      explanation: a.mistake.explanation,
      fixHint: a.mistake.fixHint,
      drillAdded: !!a.drillAdded,
      at: a.occurredAt,
    })),
  };
}

// ─── DSA ────────────────────────────────────────────────────────────────────

// GET /api/practice/dsa
exports.getDsaOverview = async (req, res) => {
  try {
    const { now } = await clockFor(req);
    const progress = await PracticeProgress.find({ candidate: req.user._id }).lean();
    const overview = mastery.patternOverview(progress, now);
    const reviews = mastery.dueReviews(progress, now);

    res.json({
      success: true,
      now,
      patterns: overview.patterns,
      reviews,
      recommendation: mastery.recommendation(overview, reviews),
      stats: {
        solved: progress.filter((p) => p.solved).length,
        total: overview.patterns.reduce((sum, p) => sum + p.problems.length, 0),
        mastered: overview.patterns.filter((p) => p.status === 'mastered').length,
        average: mastery.averageLevel(overview.levels),
      },
      journal: await journalSummary(req.user._id, now),
      thresholds: { mastered: mastery.MASTERED_LEVEL, unlock: mastery.UNLOCK_LEVEL },
    });
  } catch (error) {
    console.error('[practice] overview error:', error);
    res.status(500).json({ message: 'Failed to load practice' });
  }
};

// GET /api/practice/dsa/problems/:slug
exports.getDsaProblem = async (req, res) => {
  try {
    const problem = getProblem(req.params.slug);
    if (!problem) return res.status(404).json({ message: 'Problem not found' });

    const { now } = await clockFor(req);
    const progress = await PracticeProgress.findOne({ candidate: req.user._id, slug: problem.slug }).lean();
    const lastAttempt = await PracticeAttempt.findOne({ candidate: req.user._id, kind: 'dsa', ref: problem.slug })
      .sort({ occurredAt: -1 })
      .select('code passed occurredAt')
      .lean();

    res.json({
      success: true,
      problem: problemForStudent(problem, { solved: !!(progress && progress.solved) }),
      harness: HARNESS,
      progress: {
        solved: !!(progress && progress.solved),
        attempts: progress ? progress.attempts : 0,
        credit: progress ? progress.credit : 0,
        due: mastery.isDue(progress, now),
        nextReviewAt: progress ? progress.nextReviewAt : null,
        reviewStage: progress ? progress.reviewStage : 0,
        hintLevel: progress ? progress.hintLevelOpen : 0,
        hints: progress ? progress.openedHints : [],
      },
      lastCode: lastAttempt ? lastAttempt.code : null,
    });
  } catch (error) {
    console.error('[practice] problem error:', error);
    res.status(500).json({ message: 'Failed to load problem' });
  }
};

// POST /api/practice/dsa/problems/:slug/hint  { code }
exports.getDsaHint = async (req, res) => {
  try {
    const problem = getProblem(req.params.slug);
    if (!problem) return res.status(404).json({ message: 'Problem not found' });

    const progress = await PracticeProgress.findOneAndUpdate(
      { candidate: req.user._id, slug: problem.slug },
      { $setOnInsert: { clerkId: req.clerkId, pattern: problem.pattern } },
      { new: true, upsert: true }
    );

    // The ladder only moves one step at a time, and stops at the third hint
    const level = Math.min(3, (progress.hintLevelOpen || 0) + 1);
    if ((progress.hintLevelOpen || 0) >= 3) {
      return res.json({ success: true, level: 3, hint: null, hints: progress.openedHints, exhausted: true });
    }

    const hint = await hintFor(problem, level, cleanCode(req.body && req.body.code));
    progress.hintLevelOpen = level;
    progress.openedHints = [...(progress.openedHints || []), hint.text];
    await progress.save();

    res.json({
      success: true,
      level,
      hint: hint.text,
      source: hint.source,
      hints: progress.openedHints,
      creditIfSolvedNow: mastery.creditFor(level, progress.failedSinceSuccess),
    });
  } catch (error) {
    console.error('[practice] hint error:', error);
    res.status(500).json({ message: 'Failed to get a hint' });
  }
};

function readResults(body) {
  const results = body && body.results ? body.results : {};
  const total = Math.max(0, Math.round(Number(results.total) || 0));
  const passedCount = Math.min(total, Math.max(0, Math.round(Number(results.passedCount) || 0)));
  const failures = (Array.isArray(results.failures) ? results.failures : []).slice(0, 3).map((f) => ({
    args: f.args,
    expected: f.expected,
    actual: f.actual,
    error: f.error ? String(f.error).slice(0, 500) : null,
    kind: ['example', 'hidden', 'large'].includes(f.kind) ? f.kind : 'hidden',
  }));
  return {
    total,
    passedCount,
    failures,
    error: results.error ? String(results.error).slice(0, 1000) : null,
    timedOut: !!results.timedOut,
    timedOutKind: ['example', 'hidden', 'large'].includes(results.timedOutKind) ? results.timedOutKind : null,
  };
}

// POST /api/practice/dsa/problems/:slug/attempts  { code, results, timeSpentSec }
exports.submitDsaAttempt = async (req, res) => {
  try {
    const problem = getProblem(req.params.slug);
    if (!problem) return res.status(404).json({ message: 'Problem not found' });

    const results = readResults(req.body);
    const expectedTotal = problem.examples.length + problem.tests.length + problem.perf.length;
    // A pass must cover every case of this problem, not a subset chosen by the browser
    const passed = results.total === expectedTotal && results.passedCount === expectedTotal
      && !results.error && !results.timedOut;

    const { profile, now } = await clockFor(req);
    const progress = await PracticeProgress.findOneAndUpdate(
      { candidate: req.user._id, slug: problem.slug },
      { $setOnInsert: { clerkId: req.clerkId, pattern: problem.pattern } },
      { new: true, upsert: true }
    );
    const outcome = mastery.applyAttempt(progress, { passed, now });
    await progress.save();

    const code = cleanCode(req.body.code);
    const mistake = passed ? null : await classifyFailure(problem, code, results);

    const attempt = await PracticeAttempt.create({
      candidate: req.user._id,
      clerkId: req.clerkId,
      kind: 'dsa',
      ref: problem.slug,
      topic: problem.pattern,
      title: problem.title,
      passed,
      passedCount: results.passedCount,
      total: results.total,
      timeSpentSec: Math.max(0, Math.min(6 * 3600, Math.round(Number(req.body.timeSpentSec) || 0))),
      hintLevel: outcome.hintLevel,
      isReview: outcome.isReview,
      credit: outcome.credit,
      mistake: mistake || undefined,
      code,
      failure: results.failures[0] || (results.error ? { error: results.error } : null),
      occurredAt: now,
    });

    const allProgress = await PracticeProgress.find({ candidate: req.user._id }).lean();
    const overview = mastery.patternOverview(allProgress, now);
    const patternLevel = overview.levels[problem.pattern] || 0;

    let planChanges = [];
    let drill = null;

    if (passed && (outcome.firstSolve || outcome.reviewChange === 'advanced')) {
      // XP and plan credit only for a first solve and for each review step,
      // so re-solving the same problem repeatedly earns nothing extra
      const result = await recordEvidence({
        clerkId: req.clerkId,
        type: 'dsa_solved',
        topic: patternName(problem.pattern),
        score: Math.round(outcome.credit * 100),
        refId: `${problem.slug}:${outcome.firstSolve ? 'first' : `review-${progress.reviewStage}`}`,
        meta: { pattern: problem.pattern, patternLevel, slug: problem.slug, isReview: outcome.isReview },
      });
      planChanges = result.planChanges || [];
    }

    if (!passed && mistake && profile) {
      const op = await drillForRepeatedMistake(req.user._id, mistake.type, problem.pattern);
      const plan = op ? await JourneyPlan.findOne({ candidate: req.user._id }) : null;
      if (op && plan) {
        const changes = applyOps(profile, plan, [op], now);
        if (changes.length) {
          logChange(plan, 'mistake', `Repeated mistake "${MISTAKE_LABELS[mistake.type]}": a drill was added.`, changes, now);
          await plan.save();
          attempt.drillAdded = true;
          await attempt.save();
          drill = { title: op.title, reason: op.reason };
          planChanges = changes;
        }
      }
    }

    res.json({
      success: true,
      passed,
      credit: outcome.credit,
      firstSolve: outcome.firstSolve,
      isReview: outcome.isReview,
      reviewChange: outcome.reviewChange,
      nextReviewAt: progress.nextReviewAt,
      reviewStage: progress.reviewStage,
      pattern: { key: problem.pattern, name: patternName(problem.pattern), level: patternLevel },
      mistake: mistake ? { ...mistake, label: MISTAKE_LABELS[mistake.type] } : null,
      drill,
      planChanges,
      complexity: passed ? problem.complexity : null,
    });
  } catch (error) {
    console.error('[practice] attempt error:', error);
    res.status(500).json({ message: 'Failed to record the attempt' });
  }
};

// ─── Practice Lab ───────────────────────────────────────────────────────────

// GET /api/practice/lab
exports.getLab = async (req, res) => {
  try {
    const { profile, now } = await clockFor(req);
    if (!profile) return res.status(404).json({ message: 'Set up your journey first, so the Lab knows your branch.' });

    const progress = await SubjectProgress.find({ candidate: req.user._id }).lean();
    const bySubject = Object.fromEntries(progress.map((p) => [p.subject, p]));
    const skills = Object.fromEntries((profile.skills || []).map((s) => [s.name.toLowerCase(), s.level]));

    // Subjects from classes, an exam sprint or snapped notes come first
    const fromClasses = await extraLabSubjects(req.user._id);
    const own = lab.labSubjects(profile);
    const list = [...fromClasses, ...own.filter((s) => !fromClasses.includes(s))];
    const subjects = list.map((subject) => {
      const p = bySubject[subject];
      return {
        subject,
        level: skills[subject.toLowerCase()] ?? null,
        sets: p ? p.sets : 0,
        lastScore: p ? p.lastScore : null,
        due: !!(p && p.nextReviewAt && now >= new Date(p.nextReviewAt)),
        nextReviewAt: p ? p.nextReviewAt : null,
        missedConcepts: p ? p.missedConcepts : [],
        difficulty: lab.difficultyFor(profile, subject),
        fromClass: fromClasses.includes(subject),
      };
    });

    res.json({ success: true, branch: profile.branch, subjects, journal: await journalSummary(req.user._id, now) });
  } catch (error) {
    console.error('[lab] overview error:', error);
    res.status(500).json({ message: 'Failed to load the Practice Lab' });
  }
};

// POST /api/practice/lab/sets  { subject }
exports.createLabSet = async (req, res) => {
  try {
    const { profile, now } = await clockFor(req);
    if (!profile) return res.status(404).json({ message: 'Set up your journey first.' });

    const subject = String((req.body && req.body.subject) || '').trim().slice(0, 100);
    if (!lab.labSubjects(profile).includes(subject) && !(await extraLabSubjects(req.user._id)).includes(subject)) {
      return res.status(400).json({ message: 'Choose one of the listed subjects' });
    }

    const progress = await SubjectProgress.findOne({ candidate: req.user._id, subject }).lean();
    const due = !!(progress && progress.nextReviewAt && now >= new Date(progress.nextReviewAt));
    const difficulty = lab.difficultyFor(profile, subject);

    let questions;
    try {
      questions = await lab.generateQuestions(profile, subject, difficulty, progress ? progress.missedConcepts : []);
    } catch (err) {
      console.warn('[lab] question generation failed:', err.message);
      return res.status(503).json({ message: 'The question generator is busy right now. Please try again in a minute.' });
    }

    const set = await LabSet.create({
      candidate: req.user._id,
      clerkId: req.clerkId,
      subject,
      difficulty,
      isReview: due,
      questions,
    });

    res.status(201).json({ success: true, set: { id: String(set._id), subject, difficulty, isReview: due, questions: lab.publicQuestions(set) } });
  } catch (error) {
    console.error('[lab] create error:', error);
    res.status(500).json({ message: 'Failed to create a question set' });
  }
};

// POST /api/practice/lab/sets/:id/submit  { answers }
exports.submitLabSet = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(404).json({ message: 'Set not found' });
    const set = await LabSet.findOne({ _id: req.params.id, candidate: req.user._id });
    if (!set) return res.status(404).json({ message: 'Set not found' });
    if (set.submitted) return res.status(409).json({ message: 'This set was already submitted' });

    const { now } = await clockFor(req);
    const { results, score } = lab.grade(set, req.body && req.body.answers);

    set.submitted = true;
    set.answers = results.map((r) => r.given);
    set.score = score;
    set.submittedAt = now;
    await set.save();

    const missed = results.filter((r) => !r.correct).map((r) => r.concept).filter(Boolean);
    const correct = results.filter((r) => r.correct).map((r) => r.concept).filter(Boolean);

    const progress = await SubjectProgress.findOneAndUpdate(
      { candidate: req.user._id, subject: set.subject },
      { $setOnInsert: { clerkId: req.clerkId } },
      { new: true, upsert: true }
    );
    lab.applySetResult(progress, { score, missedConcepts: missed, correctConcepts: correct, now });
    await progress.save();

    // Each wrong answer goes into the mistake journal under its concept
    const wrong = results.filter((r) => !r.correct);
    if (wrong.length) {
      await PracticeAttempt.insertMany(wrong.map((r) => ({
        candidate: req.user._id,
        clerkId: req.clerkId,
        kind: 'lab',
        ref: String(set._id),
        topic: set.subject,
        title: r.concept || set.subject,
        passed: false,
        passedCount: 0,
        total: 1,
        isReview: set.isReview,
        mistake: {
          type: set.questions[r.index].type === 'numeric' && r.given !== null ? 'calculation_error' : 'concept_gap',
          explanation: set.questions[r.index].question.slice(0, 300),
          fixHint: r.explanation.slice(0, 300),
          source: 'rule',
        },
        occurredAt: now,
      })));
    }

    const evidence = await recordEvidence({
      clerkId: req.clerkId,
      type: 'quiz_completed',
      topic: set.subject,
      score,
      refId: `lab:${set._id}`,
      meta: { source: 'lab', difficulty: set.difficulty, missedConcepts: missed.slice(0, 5) },
    });

    res.json({
      success: true,
      score,
      passed: score >= lab.PASS_SCORE,
      results,
      nextReviewAt: progress.nextReviewAt,
      planChanges: evidence.planChanges || [],
    });
  } catch (error) {
    console.error('[lab] submit error:', error);
    res.status(500).json({ message: 'Failed to grade the set' });
  }
};

// GET /api/practice/journal
exports.getJournal = async (req, res) => {
  try {
    const { now } = await clockFor(req);
    res.json({ success: true, ...(await journalSummary(req.user._id, now)) });
  } catch (error) {
    console.error('[practice] journal error:', error);
    res.status(500).json({ message: 'Failed to load the mistake journal' });
  }
};
