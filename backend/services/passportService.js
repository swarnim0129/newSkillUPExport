// Skill passport: a public page where every claim links to recorded results.
// Nothing here is typed in by the student except the headline.

const crypto = require('crypto');
const Passport = require('../models/Passport');
const Candidate = require('../models/Candidate');
const StudentProfile = require('../models/StudentProfile');
const StudentEvent = require('../models/StudentEvent');
const PracticeAttempt = require('../models/PracticeAttempt');
const PracticeProgress = require('../models/PracticeProgress');
const ClassMember = require('../models/ClassMember');
const Classroom = require('../models/Classroom');
const Submission = require('../models/Submission');
const Assignment = require('../models/Assignment');
const Mentor = require('../models/Mentor');
const { patternOverview } = require('./practice/masteryService');
const { getProblem, patternName } = require('./practice/dsaBank');
const { journeyNow, currentSemester, yearOfSemester } = require('./journey/clock');

const HANDLE_RE = /^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])?$/;
const NON_SUBJECT_SKILLS = /^(dsa:|interviewing$|resume$|communication$)/i;

function slugify(text) {
  return String(text || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24);
}

async function ensurePassport(candidate) {
  let passport = await Passport.findOne({ candidate: candidate._id });
  if (passport) return passport;
  const base = slugify(`${candidate.firstName || ''} ${candidate.lastName || ''}`) || 'student';
  for (let i = 0; i < 6; i++) {
    const handle = `${base}-${crypto.randomBytes(2).toString('hex')}`;
    try {
      passport = await Passport.create({ candidate: candidate._id, handle });
      return passport;
    } catch (err) {
      if (!(err && err.code === 11000)) throw err;
    }
  }
  throw new Error('Could not create a passport handle');
}

function validHandle(handle) {
  return HANDLE_RE.test(handle);
}

/** Everything the public page shows, built from the event log. */
async function buildPassport(passport) {
  const candidate = await Candidate.findById(passport.candidate).select('firstName lastName createdAt').lean();
  if (!candidate) return null;
  const profile = await StudentProfile.findOne({ candidate: candidate._id }).lean();
  const now = profile ? journeyNow(profile) : new Date();
  const show = passport.show || {};

  const [progress, solves, interviews, resumes, firstEvent, eventCount, memberships] = await Promise.all([
    PracticeProgress.find({ candidate: candidate._id }).lean(),
    PracticeAttempt.find({ candidate: candidate._id, kind: 'dsa', passed: true }).sort({ occurredAt: -1 }).select('ref title topic hintLevel occurredAt timeSpentSec').lean(),
    StudentEvent.find({ candidate: candidate._id, type: 'interview_completed' }).sort({ occurredAt: 1 }).select('score topic occurredAt').lean(),
    StudentEvent.find({ candidate: candidate._id, type: 'resume_analyzed' }).sort({ score: -1 }).limit(1).select('score occurredAt').lean(),
    StudentEvent.findOne({ candidate: candidate._id }).sort({ occurredAt: 1 }).select('occurredAt').lean(),
    StudentEvent.countDocuments({ candidate: candidate._id }),
    ClassMember.find({ candidate: candidate._id }).lean(),
  ]);

  const sections = {};

  if (show.journey !== false && profile) {
    const semester = currentSemester(profile, now);
    sections.journey = {
      branch: profile.branch,
      degree: profile.degree,
      college: profile.college || '',
      semester,
      year: yearOfSemester(semester),
      goal: profile.goal && profile.goal.type,
      targetRole: (profile.goal && profile.goal.targetRole) || '',
    };
  }

  if (show.dsa !== false) {
    const overview = patternOverview(progress, now);
    const firstTry = progress.filter((p) => p.solved && (p.attempts || 0) <= 1).length;
    const solvedSlugs = progress.filter((p) => p.solved).length;
    const hints = solves.map((s) => s.hintLevel || 0);
    sections.dsa = {
      solved: solvedSlugs,
      firstTryRate: solvedSlugs ? Math.round((100 * firstTry) / solvedSlugs) : null,
      averageHints: hints.length ? Math.round((10 * hints.reduce((a, b) => a + b, 0)) / hints.length) / 10 : null,
      patterns: overview.patterns.map((p) => ({ key: p.key, name: p.name, level: p.level, status: p.status, solved: p.solved, total: p.problems.length })),
      mastered: overview.patterns.filter((p) => p.status === 'mastered').map((p) => p.name),
      recent: solves.slice(0, 6).map((s) => {
        const problem = getProblem(s.ref);
        return {
          title: s.title || (problem && problem.title) || s.ref,
          pattern: problem ? patternName(problem.pattern) : s.topic,
          difficulty: problem ? problem.difficulty : null,
          hints: s.hintLevel || 0,
          at: s.occurredAt,
        };
      }),
    };
  }

  if (show.subjects !== false && profile) {
    sections.subjects = (profile.skills || [])
      .filter((sk) => sk.evidenceCount > 0 && !NON_SUBJECT_SKILLS.test(sk.name))
      .sort((a, b) => b.level - a.level)
      .slice(0, 10)
      .map((sk) => ({ name: sk.name, level: sk.level, results: sk.evidenceCount, updatedAt: sk.updatedAt }));
  }

  if (show.interviews !== false && interviews.length) {
    const scores = interviews.filter((e) => typeof e.score === 'number');
    sections.interviews = {
      count: interviews.length,
      best: scores.length ? Math.max(...scores.map((e) => e.score)) : null,
      latest: scores.length ? scores[scores.length - 1].score : null,
      trend: scores.slice(-10).map((e) => ({ at: e.occurredAt, score: e.score, role: e.topic })),
    };
  }

  if (show.resume !== false && resumes.length) {
    sections.resume = { best: resumes[0].score, at: resumes[0].occurredAt };
  }

  if (show.classes !== false && memberships.length) {
    const classrooms = await Classroom.find({ _id: { $in: memberships.map((m) => m.classroom) } }).select('name mentor').lean();
    const mentors = await Mentor.find({ _id: { $in: classrooms.map((c) => c.mentor) } }).select('name department').lean();
    const subs = await Submission.find({ candidate: candidate._id, completedAt: { $ne: null } }).select('assignment grade completedAt').lean();
    const assignments = await Assignment.find({ _id: { $in: subs.map((s) => s.assignment) } }).select('points dueAt').lean();
    const byId = Object.fromEntries(assignments.map((a) => [String(a._id), a]));
    const graded = subs.filter((s) => typeof s.grade === 'number' && byId[String(s.assignment)] && byId[String(s.assignment)].points > 0);
    const onTime = subs.filter((s) => { const a = byId[String(s.assignment)]; return a && (!a.dueAt || new Date(s.completedAt) <= new Date(a.dueAt)); }).length;
    sections.classes = {
      list: classrooms.map((c) => {
        const m = mentors.find((x) => String(x._id) === String(c.mentor));
        return { name: c.name, mentor: m ? m.name : '', department: m ? m.department : '' };
      }),
      completed: subs.length,
      onTime,
      averageGrade: graded.length ? Math.round(graded.reduce((sum, s) => sum + (100 * s.grade) / byId[String(s.assignment)].points, 0) / graded.length) : null,
    };
  }

  return {
    handle: passport.handle,
    name: `${candidate.firstName || ''} ${candidate.lastName || ''}`.trim() || 'SkillUp student',
    headline: passport.headline,
    sections,
    verification: {
      results: eventCount + solves.length,
      since: firstEvent ? firstEvent.occurredAt : candidate.createdAt,
      updatedAt: new Date(),
      note: 'Every number on this page is computed by SkillUp from results recorded on the platform: solved problems run against hidden tests, scored practice sets, AI-scored interviews and class grades. The student cannot edit them.',
    },
  };
}

module.exports = { ensurePassport, buildPassport, validHandle, slugify };
