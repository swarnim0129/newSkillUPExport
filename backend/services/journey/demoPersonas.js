// Ready-made students for demonstrations. Loading one replaces the signed-in
// student's journey with a lived-in history, so each year's behaviour can be
// shown without waiting four years.

const StudentProfile = require('../../models/StudentProfile');
const JourneyPlan = require('../../models/JourneyPlan');
const StudentEvent = require('../../models/StudentEvent');
const CompanionMessage = require('../../models/CompanionMessage');
const Interview = require('../../models/Interview');
const { buildTemplatePlan } = require('./templates');
const { draftToMilestone, logChange, applyEvidence, syncWithClock } = require('./planService');
const { updateSkills } = require('../evidenceService');
const { addMonths, addDays, yearOfSemester, currentSemester, semesterStart, stageFor, TOTAL_SEMESTERS } = require('./clock');
const PracticeProgress = require('../../models/PracticeProgress');
const PracticeAttempt = require('../../models/PracticeAttempt');
const SubjectProgress = require('../../models/SubjectProgress');
const LabSet = require('../../models/LabSet');
const { applyOps } = require('./planService');
const { readiness } = require('./forecastService');
const { applyAttempt, patternOverview } = require('../practice/masteryService');
const { getProblem, patternName, problemsForPattern } = require('../practice/dsaBank');
const { MISTAKE_LABELS, DRILL_ADVICE } = require('../practice/coachService');

const PERSONAS = {
  first_year_cs: {
    label: 'First year, Computer Science, still exploring',
    branch: 'Computer Science and Engineering',
    college: 'Demo Institute of Technology',
    startSemester: 1,
    monthsOnPlatform: 3,
    goal: { type: 'undecided', targetRole: '', note: 'Curious about web development and AI' },
    hoursPerWeek: 8,
    interests: ['Web development', 'Artificial intelligence'],
    memory: [
      'First in the family to study engineering.',
      'Travels 90 minutes to college each way, so weekday study time is short.',
    ],
    // Indexes of past-due milestones left unfinished
    missed: [1],
    events: [
      { daysAgo: 40, type: 'roadmap_node_completed', topic: 'Programming fundamentals', meta: { progressPercent: 40 } },
      { daysAgo: 12, type: 'quiz_completed', topic: 'Programming fundamentals', score: 45 },
    ],
    // DSA submissions: pass, or fail with the kind of mistake made
    practice: [
      { daysAgo: 30, slug: 'contains-duplicate', pass: true },
      { daysAgo: 21, slug: 'two-sum', mistake: 'edge_case' },
      { daysAgo: 20, slug: 'two-sum', pass: true, hints: 1 },
      { daysAgo: 9, slug: 'valid-palindrome', mistake: 'edge_case' },
      { daysAgo: 4, slug: 'group-anagrams', mistake: 'logic_error' },
    ],
    labs: [],
  },
  third_year_mech: {
    label: 'Third year, Mechanical, aiming for GATE',
    branch: 'Mechanical Engineering',
    college: 'Demo Institute of Technology',
    startSemester: 3,
    monthsOnPlatform: 13,
    goal: { type: 'higher_studies', targetRole: '', note: 'Wants an M.Tech through GATE' },
    hoursPerWeek: 12,
    interests: ['Thermal engineering', 'Design'],
    memory: [
      'Decided on GATE over placements at the end of second year.',
      'Part of the college Formula Student team, busy on weekends during competition season.',
    ],
    missed: [5],
    events: [
      { daysAgo: 300, type: 'quiz_completed', topic: 'Thermodynamics', score: 82, meta: { source: 'lab' } },
      { daysAgo: 160, type: 'roadmap_completed', topic: 'Strength of materials' },
      { daysAgo: 150, type: 'quiz_completed', topic: 'Strength of materials', score: 40, meta: { source: 'lab' } },
      { daysAgo: 45, type: 'quiz_completed', topic: 'Quantitative aptitude', score: 60, meta: { source: 'lab' } },
      { daysAgo: 30, type: 'resume_analyzed', topic: 'Resume', score: 58, meta: { missingKeywords: ['ANSYS', 'GD&T', 'Project outcomes'] } },
    ],
    practice: [],
    // Practice Lab sets: subject, score, concepts missed
    labs: [
      { daysAgo: 300, subject: 'Thermodynamics', score: 82, missed: ['Entropy change in irreversible processes'] },
      { daysAgo: 150, subject: 'Strength of materials', score: 40, missed: ['Bending stress', 'Mohr circle', 'Shear force diagrams'] },
      { daysAgo: 45, subject: 'Quantitative aptitude', score: 60, missed: ['Time and work'] },
    ],
  },
  final_year_ece: {
    label: 'Final year, Electronics, switching to software',
    branch: 'Electronics and Communication Engineering',
    college: 'Demo Institute of Technology',
    startSemester: 5,
    monthsOnPlatform: 12,
    goal: { type: 'placement', targetRole: 'Software Engineer', note: 'Moving from core electronics to software roles' },
    hoursPerWeek: 15,
    interests: ['Backend development', 'Embedded systems'],
    memory: [
      'Changed goal from core electronics to software in third year.',
      'Did a summer internship in embedded firmware.',
      'Gets nervous in the first five minutes of interviews.',
    ],
    missed: [3],
    events: [
      { daysAgo: 200, type: 'quiz_completed', topic: 'Data structures and algorithms', score: 68 },
      { daysAgo: 120, type: 'interview_completed', topic: 'Software Engineer', score: 45, meta: { technical: 4, communication: 5, weaknesses: ['Could not explain time complexity clearly'] } },
      { daysAgo: 60, type: 'resume_analyzed', topic: 'Resume', score: 74 },
      { daysAgo: 20, type: 'interview_completed', topic: 'Software Engineer', score: 70, meta: { technical: 7, communication: 7, weaknesses: ['Rushed the system design answer'] } },
    ],
    practice: [
      { daysAgo: 330, slug: 'contains-duplicate', pass: true },
      { daysAgo: 328, slug: 'contains-duplicate', pass: true },
      { daysAgo: 321, slug: 'contains-duplicate', pass: true },
      { daysAgo: 325, slug: 'two-sum', pass: true },
      { daysAgo: 315, slug: 'group-anagrams', pass: true, hints: 1 },
      { daysAgo: 300, slug: 'valid-palindrome', pass: true },
      { daysAgo: 290, slug: 'container-with-most-water', pass: true },
      { daysAgo: 280, slug: 'valid-parentheses', pass: true },
      { daysAgo: 270, slug: 'daily-temperatures', pass: true, hints: 2 },
      { daysAgo: 250, slug: 'binary-search', mistake: 'off_by_one' },
      { daysAgo: 249, slug: 'binary-search', pass: true },
      { daysAgo: 230, slug: 'search-rotated-array', mistake: 'off_by_one' },
      { daysAgo: 229, slug: 'search-rotated-array', mistake: 'off_by_one' },
      { daysAgo: 228, slug: 'search-rotated-array', pass: true, hints: 2 },
      { daysAgo: 180, slug: 'best-time-to-sell', pass: true },
      { daysAgo: 170, slug: 'longest-unique-substring', mistake: 'too_slow' },
      { daysAgo: 169, slug: 'longest-unique-substring', pass: true },
      { daysAgo: 120, slug: 'max-depth-binary-tree', pass: true },
      { daysAgo: 110, slug: 'level-order-traversal', mistake: 'edge_case' },
      { daysAgo: 70, slug: 'climbing-stairs', pass: true },
      { daysAgo: 50, slug: 'house-robber', pass: true, hints: 1 },
      { daysAgo: 12, slug: 'minimum-eating-speed', mistake: 'off_by_one' },
    ],
    labs: [],
  },
};

function listPersonas() {
  return Object.entries(PERSONAS).map(([key, p]) => ({ key, label: p.label }));
}

/**
 * Replace the candidate's journey with a persona. Deletes their existing
 * journey profile, plan, evidence and companion messages.
 */
async function loadPersona(candidate, key) {
  const persona = PERSONAS[key];
  if (!persona) return null;

  await Promise.all([
    PracticeProgress.deleteMany({ candidate: candidate._id }),
    PracticeAttempt.deleteMany({ candidate: candidate._id }),
    SubjectProgress.deleteMany({ candidate: candidate._id }),
    LabSet.deleteMany({ candidate: candidate._id }),
    StudentProfile.deleteOne({ candidate: candidate._id }),
    JourneyPlan.deleteOne({ candidate: candidate._id }),
    StudentEvent.deleteMany({ candidate: candidate._id }),
    CompanionMessage.deleteMany({ candidate: candidate._id }),
    Interview.deleteMany({ clerkId: candidate.clerkId, vapiCallId: /^demo-/ }),
  ]);

  const now = new Date();
  const setupAt = addMonths(now, -persona.monthsOnPlatform);

  const profile = new StudentProfile({
    candidate: candidate._id,
    clerkId: candidate.clerkId,
    college: persona.college,
    branch: persona.branch,
    semesterAtSetup: persona.startSemester,
    setupAt,
    goal: persona.goal,
    hoursPerWeek: persona.hoursPerWeek,
    interests: persona.interests,
    memory: persona.memory.map((text) => ({ text, source: 'setup', createdAt: setupAt })),
    lastCheckInAt: addDays(now, -8),
    clockOffsetDays: 0,
  });

  const drafts = buildTemplatePlan(profile, persona.startSemester);
  const plan = new JourneyPlan({
    candidate: candidate._id,
    clerkId: candidate.clerkId,
    generatedBy: 'template',
    stageYear: yearOfSemester(persona.startSemester),
    milestones: drafts.map((d) => draftToMilestone(profile, d)),
    changeLog: [],
  });
  const startStage = stageFor(yearOfSemester(persona.startSemester));
  logChange(
    plan,
    'setup',
    `Plan created from semester ${persona.startSemester} to ${TOTAL_SEMESTERS} for ${persona.branch}. You start in "${startStage.name}" mode.`,
    [],
    setupAt
  );

  // Work that was due in the past is finished, apart from the ones this student missed
  const pastDue = plan.milestones
    .filter((m) => new Date(m.dueAt) < addDays(now, -10) && !['dsa', 'practice'].includes(m.tool))
    .sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt));
  pastDue.forEach((milestone, index) => {
    if (persona.missed.includes(index)) return;
    milestone.status = 'done';
    milestone.completedAt = milestone.dueAt;
  });

  // Replay their history in order so skills and plan changes build up as they would have.
  // Moves into a new year are part of that history, at the date they happened.
  const yearNow = yearOfSemester(currentSemester(profile, now));
  const yearChanges = [];
  for (let year = yearOfSemester(persona.startSemester) + 1; year <= yearNow; year++) {
    yearChanges.push({ year, at: semesterStart(profile, year * 2 - 1) });
  }

  // A readiness reading every month, taken from the history replayed so far
  const readings = [];
  for (let month = 1; month <= persona.monthsOnPlatform; month++) readings.push(addMonths(setupAt, month));

  const history = [
    ...persona.events.map((item) => ({ item, at: addDays(now, -item.daysAgo) })),
    ...yearChanges.map((change) => ({ yearChange: change, at: change.at })),
    ...persona.practice.map((attempt) => ({ attempt, at: addDays(now, -attempt.daysAgo) })),
    ...persona.labs.map((labSet) => ({ labSet, at: addDays(now, -labSet.daysAgo) })),
    ...readings.map((at) => ({ reading: true, at })),
  ].sort((a, b) => a.at - b.at);

  const eventDocs = [];
  const progressBySlug = {};
  const attemptDocs = [];
  const subjectDocs = {};
  const mistakeCounts = {};
  profile.readinessHistory = [];

  history.forEach(({ item, yearChange, attempt, labSet, reading, at }, index) => {
    if (reading) {
      const levels = patternOverview(Object.values(progressBySlug), at).levels;
      profile.readinessHistory.push({ at, value: readiness(profile, plan, levels).value });
      return;
    }

    if (attempt) {
      const problem = getProblem(attempt.slug);
      const progress = progressBySlug[attempt.slug] || {
        candidate: candidate._id,
        clerkId: candidate.clerkId,
        slug: attempt.slug,
        pattern: problem.pattern,
        attempts: 0,
        failedSinceSuccess: 0,
        solved: false,
        credit: 0,
        reviewStage: 0,
        nextReviewAt: null,
        hintLevelOpen: 0,
        openedHints: [],
      };
      progressBySlug[attempt.slug] = progress;
      progress.hintLevelOpen = Math.max(progress.hintLevelOpen, attempt.hints || 0);
      const outcome = applyAttempt(progress, { passed: !!attempt.pass, now: at });

      const doc = {
        candidate: candidate._id,
        clerkId: candidate.clerkId,
        kind: 'dsa',
        ref: problem.slug,
        topic: problem.pattern,
        title: problem.title,
        passed: !!attempt.pass,
        passedCount: attempt.pass ? 1 : 0,
        total: 1,
        hintLevel: outcome.hintLevel,
        isReview: outcome.isReview,
        credit: outcome.credit,
        occurredAt: at,
      };

      if (attempt.pass && (outcome.firstSolve || outcome.reviewChange === 'advanced')) {
        const level = patternOverview(Object.values(progressBySlug), at).levels[problem.pattern] || 0;
        const event = {
          candidate: candidate._id,
          clerkId: candidate.clerkId,
          type: 'dsa_solved',
          topic: patternName(problem.pattern),
          score: Math.round(outcome.credit * 100),
          refId: `${problem.slug}:${outcome.firstSolve ? 'first' : `review-${progress.reviewStage}`}`,
          meta: { pattern: problem.pattern, patternLevel: level, slug: problem.slug },
          occurredAt: at,
        };
        eventDocs.push(event);
        updateSkills(profile, event, at);
        applyEvidence(profile, plan, event, at);
      }

      if (!attempt.pass) {
        doc.mistake = { type: attempt.mistake, explanation: `${MISTAKE_LABELS[attempt.mistake]} on ${problem.title}.`, fixHint: '', source: 'rule' };
        mistakeCounts[attempt.mistake] = (mistakeCounts[attempt.mistake] || 0) + 1;
        // Second time the same mistake shows up: the plan gets a drill, as it would live
        if (mistakeCounts[attempt.mistake] === 2 && DRILL_ADVICE[attempt.mistake]) {
          const practiceProblem = problemsForPattern(problem.pattern)[0];
          const changes = applyOps(profile, plan, [{
            op: 'add',
            title: `Drill: ${MISTAKE_LABELS[attempt.mistake].toLowerCase()}`,
            description: `${DRILL_ADVICE[attempt.mistake]} Then solve "${practiceProblem.title}" without hints.`,
            category: 'skills',
            tool: 'dsa',
            toolTopic: practiceProblem.slug,
            dueInDays: 5,
            origin: 'remedial',
            reason: `2 recent failed submissions were "${MISTAKE_LABELS[attempt.mistake]}".`,
          }], at);
          if (changes.length) {
            logChange(plan, 'mistake', `Repeated mistake "${MISTAKE_LABELS[attempt.mistake]}": a drill was added.`, changes, at);
            doc.drillAdded = true;
          }
        }
      }
      attemptDocs.push(doc);
      return;
    }

    if (labSet) {
      subjectDocs[labSet.subject] = {
        candidate: candidate._id,
        clerkId: candidate.clerkId,
        subject: labSet.subject,
        sets: ((subjectDocs[labSet.subject] && subjectDocs[labSet.subject].sets) || 0) + 1,
        lastScore: labSet.score,
        bestScore: labSet.score,
        reviewStage: 0,
        nextReviewAt: addDays(at, 3),
        missedConcepts: labSet.missed,
        lastPracticedAt: at,
      };
      labSet.missed.forEach((concept) => attemptDocs.push({
        candidate: candidate._id,
        clerkId: candidate.clerkId,
        kind: 'lab',
        ref: `demo-lab-${key}`,
        topic: labSet.subject,
        title: concept,
        passed: false,
        total: 1,
        mistake: { type: 'concept_gap', explanation: `Missed a question on ${concept}.`, fixHint: '', source: 'rule' },
        occurredAt: at,
      }));
      return;
    }


    if (yearChange) {
      const stage = stageFor(yearChange.year);
      logChange(
        plan,
        'new_year',
        `You are now in year ${yearChange.year}. Your companion has switched to "${stage.name}" mode.`,
        [{ action: 'mode', title: `Year ${yearChange.year}: ${stage.name}`, detail: stage.focus }],
        at
      );
      plan.stageYear = yearChange.year;
      return;
    }
    const event = {
      candidate: candidate._id,
      clerkId: candidate.clerkId,
      type: item.type,
      topic: item.topic || '',
      score: typeof item.score === 'number' ? item.score : null,
      refId: `demo-${key}-${index}`,
      meta: item.meta || {},
      occurredAt: at,
    };
    eventDocs.push(event);
    updateSkills(profile, event, at);
    applyEvidence(profile, plan, event, at);
  });

  syncWithClock(profile, plan, now);
  profile.readinessHistory.push({
    at: now,
    value: readiness(profile, plan, patternOverview(Object.values(progressBySlug), now).levels).value,
  });

  await StudentEvent.insertMany(eventDocs);
  if (Object.keys(progressBySlug).length) await PracticeProgress.insertMany(Object.values(progressBySlug));
  if (attemptDocs.length) await PracticeAttempt.insertMany(attemptDocs);
  if (Object.keys(subjectDocs).length) await SubjectProgress.insertMany(Object.values(subjectDocs));
  await profile.save();
  await plan.save();

  // A recorded mock interview, so the interview replay heatmap has something to show
  const lastInterview = [...persona.events].reverse().find((e) => e.type === 'interview_completed');
  if (lastInterview) {
    const start = addDays(now, -lastInterview.daysAgo);
    const at = (s) => new Date(start.getTime() + s * 1000);
    const role = lastInterview.topic || 'Software Engineer';
    await Interview.create({
      clerkId: candidate.clerkId,
      role,
      seniority: 'Junior',
      category: 'Technical',
      topic: 'Data structures and problem solving',
      vapiCallId: `demo-${candidate._id}`,
      status: 'completed',
      createdAt: start,
      feedback: {
        communication_score: lastInterview.meta.communication,
        technical_score: lastInterview.meta.technical,
        strengths: ['Explained the hash map idea clearly', 'Stayed calm on follow-ups'],
        weaknesses: lastInterview.meta.weaknesses || [],
        improvement_plan: 'Practise stating time and space complexity for every answer.',
        hiring_recommendation: 'Lean hire after more system design practice',
      },
      transcript: [
        { role: 'assistant', content: 'Tell me about yourself and why you want this role.', timestamp: at(0) },
        { role: 'user', content: 'Um, so, I am like a final year student and, uh, I basically like coding and stuff, so yeah.', timestamp: at(9) },
        { role: 'assistant', content: 'How would you find two numbers in an array that add up to a target?', timestamp: at(40) },
        { role: 'user', content: 'First I would store each number in a hash map with its index. Then for each number I check whether target minus that number is already in the map, because lookup is O(1). That makes the whole thing O(n) time and O(n) space, which is the trade-off against the O(n squared) brute force.', timestamp: at(46) },
        { role: 'assistant', content: 'What is the difference between a process and a thread?', timestamp: at(110) },
        { role: 'user', content: 'I think a process is maybe like a program and a thread is, I guess, kind of part of it? I am not sure about the memory part.', timestamp: at(141) },
        { role: 'assistant', content: 'Design a URL shortener at a high level.', timestamp: at(190) },
        { role: 'user', content: 'I would have an API that takes a long URL, generates a short code with base62, and stores the mapping in a database. Reads go through a cache because they are far more common than writes.', timestamp: at(198) },
      ],
    });
  }

  // No welcome message: the weekly check-in is due, so the companion opens the
  // conversation itself the first time the thread is loaded.
  return { profile, plan };
}

module.exports = { listPersonas, loadPersona };
