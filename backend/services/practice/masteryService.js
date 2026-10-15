// How well a student knows each DSA pattern, and when problems come back for review.
//
// A problem's score is how cleanly it was last solved (credit) times how fresh
// that memory still is (retention). A pattern's level is the average score of
// its problems, so solving all of them cleanly and keeping up with reviews is 100.

const { PATTERNS, problemsForPattern, getProblem, patternName } = require('./dsaBank');

const DAY_MS = 24 * 60 * 60 * 1000;
// Spaced repetition: days until the next review after each successful review
const REVIEW_INTERVAL_DAYS = [3, 7, 21, 60];
const MASTERED_LEVEL = 75;
const UNLOCK_LEVEL = 40;
// A review attempted up to a day early still counts as the review
const EARLY_REVIEW_DAYS = 1;

function addDays(date, days) {
  return new Date(new Date(date).getTime() + days * DAY_MS);
}

/**
 * Credit for a success: every hint level used and every failed try before it
 * costs something, but a solved problem is always worth at least 0.4.
 */
function creditFor(hintLevel, failedBefore) {
  const credit = 1 - 0.2 * (hintLevel || 0) - 0.1 * Math.min(3, failedBefore || 0);
  return Math.round(Math.max(0.4, Math.min(1, credit)) * 100) / 100;
}

function isDue(progress, now) {
  return !!(progress && progress.solved && progress.nextReviewAt && now >= new Date(progress.nextReviewAt));
}

function isReviewWindow(progress, now) {
  return !!(progress && progress.solved && progress.nextReviewAt
    && now >= addDays(progress.nextReviewAt, -EARLY_REVIEW_DAYS));
}

/**
 * How much of a solved problem is still remembered: full until its review date,
 * then fading to half over twice the review interval.
 */
function retention(progress, now) {
  if (!progress || !progress.solved) return 0;
  if (!progress.nextReviewAt || now <= new Date(progress.nextReviewAt)) return 1;
  const overdueDays = (now - new Date(progress.nextReviewAt)) / DAY_MS;
  const interval = REVIEW_INTERVAL_DAYS[progress.reviewStage || 0];
  return Math.max(0.5, 1 - overdueDays / (2 * interval));
}

function problemScore(progress, now) {
  return progress && progress.solved ? (progress.credit || 0) * retention(progress, now) : 0;
}

/**
 * Update a progress record for one submission. Mutates `progress` and returns
 * what happened, for the response and the evidence log.
 */
function applyAttempt(progress, { passed, now }) {
  const wasSolved = !!progress.solved;
  const reviewing = isReviewWindow(progress, now);
  const hintLevel = progress.hintLevelOpen || 0;

  progress.attempts = (progress.attempts || 0) + 1;
  progress.lastAttemptAt = now;

  if (passed) {
    const credit = creditFor(hintLevel, progress.failedSinceSuccess);
    let reviewChange = 'none';

    if (!wasSolved) {
      progress.solved = true;
      progress.firstSolvedAt = now;
      progress.credit = credit;
      progress.reviewStage = 0;
      progress.nextReviewAt = addDays(now, REVIEW_INTERVAL_DAYS[0]);
      reviewChange = 'scheduled';
    } else {
      // Solving again never lowers the credit; a clean re-solve raises it
      progress.credit = Math.max(progress.credit || 0, credit);
      if (reviewing) {
        progress.reviewStage = Math.min(REVIEW_INTERVAL_DAYS.length - 1, (progress.reviewStage || 0) + 1);
        progress.nextReviewAt = addDays(now, REVIEW_INTERVAL_DAYS[progress.reviewStage]);
        reviewChange = 'advanced';
      }
    }

    progress.lastSolvedAt = now;
    progress.failedSinceSuccess = 0;
    progress.hintLevelOpen = 0;
    progress.openedHints = [];
    return { firstSolve: !wasSolved, isReview: wasSolved && reviewing, credit, hintLevel, reviewChange };
  }

  progress.failedSinceSuccess = (progress.failedSinceSuccess || 0) + 1;
  let reviewChange = 'none';
  // Failing a review means it was forgotten: start the schedule again, soon
  if (wasSolved && isDue(progress, now)) {
    progress.reviewStage = 0;
    progress.nextReviewAt = addDays(now, 1);
    progress.credit = Math.round((progress.credit || 0) * 0.8 * 100) / 100;
    reviewChange = 'reset';
  }
  return { firstSolve: false, isReview: wasSolved && reviewing, credit: 0, hintLevel, reviewChange };
}

/**
 * Level, status and problem breakdown for every pattern.
 * `progressList` is the student's PracticeProgress rows (any order).
 */
function patternOverview(progressList, now) {
  const bySlug = Object.fromEntries((progressList || []).map((p) => [p.slug, p]));

  const levels = {};
  const overview = PATTERNS.map((pattern) => {
    const problems = problemsForPattern(pattern.key).map((problem) => {
      const progress = bySlug[problem.slug];
      let status = 'new';
      if (progress && progress.solved) status = isDue(progress, now) ? 'due' : 'solved';
      else if (progress && progress.attempts) status = 'tried';
      return {
        slug: problem.slug,
        title: problem.title,
        difficulty: problem.difficulty,
        status,
        nextReviewAt: progress && progress.solved ? progress.nextReviewAt : null,
        score: Math.round(problemScore(progress, now) * 100),
      };
    });
    const total = problems.length || 1;
    const level = Math.round((100 * problems.reduce((sum, p) => sum + p.score / 100, 0)) / total);
    levels[pattern.key] = level;
    return {
      key: pattern.key,
      name: pattern.name,
      summary: pattern.summary,
      needs: pattern.needs,
      level,
      solved: problems.filter((p) => p.status === 'solved' || p.status === 'due').length,
      due: problems.filter((p) => p.status === 'due').length,
      problems,
    };
  });

  overview.forEach((pattern) => {
    const ready = pattern.needs.every((key) => (levels[key] || 0) >= UNLOCK_LEVEL);
    if (pattern.level >= MASTERED_LEVEL) pattern.status = 'mastered';
    else if (pattern.level > 0) pattern.status = 'learning';
    else if (ready) pattern.status = 'ready';
    else pattern.status = 'locked';
    pattern.needsNames = pattern.needs.map(patternName);
    // Depth in the prerequisite graph, used to lay the map out in columns
    pattern.tier = tierOf(pattern.key);
  });

  return { patterns: overview, levels };
}

const tierCache = {};
function tierOf(key) {
  if (tierCache[key] !== undefined) return tierCache[key];
  const pattern = PATTERNS.find((p) => p.key === key);
  const tier = !pattern || pattern.needs.length === 0 ? 0 : 1 + Math.max(...pattern.needs.map(tierOf));
  tierCache[key] = tier;
  return tier;
}

function dueReviews(progressList, now) {
  return (progressList || [])
    .filter((p) => isDue(p, now))
    .sort((a, b) => new Date(a.nextReviewAt) - new Date(b.nextReviewAt))
    .map((p) => {
      const problem = getProblem(p.slug);
      return {
        slug: p.slug,
        title: problem ? problem.title : p.slug,
        pattern: p.pattern,
        patternName: patternName(p.pattern),
        dueSince: p.nextReviewAt,
        stage: p.reviewStage,
      };
    });
}

/**
 * What to do next: the oldest due review, otherwise the next unsolved problem
 * in the first pattern that is open and not yet mastered.
 */
function recommendation(overview, reviews) {
  if (reviews.length) {
    const r = reviews[0];
    return { slug: r.slug, title: r.title, reason: `Due for review: keep ${r.patternName} fresh.` };
  }
  const order = ['learning', 'ready'];
  for (const status of order) {
    for (const pattern of overview.patterns) {
      if (pattern.status !== status) continue;
      const next = pattern.problems.find((p) => p.status === 'new' || p.status === 'tried');
      if (next) {
        return {
          slug: next.slug,
          title: next.title,
          reason: status === 'learning'
            ? `Continue ${pattern.name} (level ${pattern.level}).`
            : `Start ${pattern.name}: its prerequisites are in place.`,
        };
      }
    }
  }
  return null;
}

function averageLevel(levels) {
  const values = PATTERNS.map((p) => levels[p.key] || 0);
  return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
}

module.exports = {
  REVIEW_INTERVAL_DAYS,
  MASTERED_LEVEL,
  UNLOCK_LEVEL,
  creditFor,
  isDue,
  retention,
  problemScore,
  applyAttempt,
  patternOverview,
  dueReviews,
  recommendation,
  averageLevel,
  addDays,
};
