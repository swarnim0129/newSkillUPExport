// The four-year plan: how it is generated, and every way it changes afterwards.
// All changes go through applyOps so each one lands in the change log with a reason.

const JourneyPlan = require('../../models/JourneyPlan');
const { generateJson } = require('../aiJson');
const { buildTemplatePlan } = require('./templates');
const {
  TOTAL_SEMESTERS,
  journeyNow,
  addDays,
  currentSemester,
  yearOfSemester,
  stageFor,
  dueDate,
} = require('./clock');

const TOOLS = ['roadmap', 'tutor', 'flashcards', 'resume_analyzer', 'resume_builder', 'mock_interview', 'dsa', 'practice', 'companion', 'none'];
const CATEGORIES = ['academics', 'skills', 'projects', 'career', 'placement', 'habits'];
const MAX_PER_SEMESTER = 5;
const DSA_PATTERN_KEYS = require('../../data/dsa/patterns').PATTERNS.map((p) => p.key).join(', ');
const MAX_CHANGE_LOG = 80;
const OVERDUE_GRACE_DAYS = 7;

const OPEN = ['pending', 'in_progress'];

function isOpen(milestone) {
  return OPEN.includes(milestone.status);
}

function clip(value, max) {
  return String(value || '').trim().slice(0, max);
}

/**
 * A date that falls inside one of the student's exam periods moves to just
 * after it, so nothing new is scheduled during exams.
 */
function shiftOutOfExams(profile, date) {
  let result = new Date(date);
  const exams = [...(profile.exams || [])].sort((a, b) => new Date(a.startAt) - new Date(b.startAt));
  for (const exam of exams) {
    const start = addDays(exam.startAt, -2);
    const end = new Date(exam.endAt);
    if (result >= start && result <= end) result = addDays(end, 3);
  }
  return result;
}

function formatDate(date) {
  return new Date(date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ─── Generation ─────────────────────────────────────────────────────────────

function normalizeDraft(raw, minSemester) {
  if (!raw || typeof raw !== 'object') return null;
  const title = clip(raw.title, 140);
  const semester = Math.round(Number(raw.semester));
  if (!title || !Number.isFinite(semester)) return null;
  if (semester < minSemester || semester > TOTAL_SEMESTERS) return null;

  return {
    title,
    description: clip(raw.description, 500),
    semester,
    month: Math.min(6, Math.max(1, Math.round(Number(raw.month)) || 3)),
    category: CATEGORIES.includes(raw.category) ? raw.category : 'skills',
    tool: TOOLS.includes(raw.tool) ? raw.tool : 'none',
    toolTopic: clip(raw.toolTopic, 120),
    priority: raw.priority === 'stretch' ? 'stretch' : 'core',
  };
}

function capPerSemester(drafts) {
  const counts = {};
  return drafts.filter((d) => {
    counts[d.semester] = (counts[d.semester] || 0) + 1;
    return counts[d.semester] <= MAX_PER_SEMESTER;
  });
}

function plannerPrompt(profile, fromSemester) {
  const goal = profile.goal || {};
  const skills = (profile.skills || [])
    .map((s) => `${s.name}: ${s.level}/100`)
    .join(', ');
  const memory = (profile.memory || []).map((m) => `- ${m.text}`).join('\n');

  return `You plan a student's engineering degree as dated milestones.

STUDENT
- Degree and branch: ${profile.degree} in ${profile.branch}
- College: ${profile.college || 'not given'}
- Currently in semester ${fromSemester} of ${TOTAL_SEMESTERS}
- Goal: ${goal.type || 'undecided'}${goal.targetRole ? `, target role: ${goal.targetRole}` : ''}${goal.note ? ` (${goal.note})` : ''}
- Time available: ${profile.hoursPerWeek} hours per week outside classes
- Interests: ${(profile.interests || []).join(', ') || 'not given'}
- Measured skill levels: ${skills || 'none measured yet'}
${memory ? `- Known about the student:\n${memory}` : ''}

YEAR THEMES
Year 1 Explore: direction, foundations, study habit.
Year 2 Build: depth in core subjects, real projects.
Year 3 Prove: internships, resume backed by evidence, first interviews.
Year 4 Land: placements or admissions, mock interviews, applications.

Write the plan from semester ${fromSemester} to semester ${TOTAL_SEMESTERS}. Use subjects that really belong to ${profile.branch}. Fit the workload to ${profile.hoursPerWeek} hours a week. If the student starts late, cover the most important missed foundations first.

Each milestone uses one platform tool:
- "roadmap": learn a topic with a guided roadmap (toolTopic = the topic)
- "tutor": lessons and quizzes with an AI tutor (toolTopic = the subject)
- "flashcards": revision (toolTopic = what to revise)
- "resume_builder", "resume_analyzer": resume work
- "mock_interview": voice mock interview (toolTopic = the role)
- "dsa": master one DSA pattern by solving problems (toolTopic = one of: ${DSA_PATTERN_KEYS}). Use for software careers.
- "practice": numerical and multiple-choice practice for one subject (toolTopic = the subject name)
- "companion": a decision or review to talk through
- "none": done outside the platform, such as a project or applications

Return JSON only:
{"milestones":[{"title":"...","description":"one sentence, why it matters now","semester":${fromSemester},"month":1,"category":"academics|skills|projects|career|placement|habits","tool":"...","toolTopic":"...","priority":"core|stretch"}]}

Rules: 3 to ${MAX_PER_SEMESTER} milestones per semester. "month" is 1 to 6 inside the semester. Titles under 12 words, concrete and checkable. At most one "stretch" per semester.`;
}

/**
 * Milestone drafts for the rest of the degree. Tries the AI planner, falls back
 * to the built-in plan so setup never fails.
 */
async function generateDrafts(profile, fromSemester) {
  try {
    const result = await generateJson(plannerPrompt(profile, fromSemester));
    const raw = Array.isArray(result) ? result : result.milestones;
    const drafts = capPerSemester(
      (Array.isArray(raw) ? raw : [])
        .map((item) => normalizeDraft(item, fromSemester))
        .filter(Boolean)
        .sort((a, b) => a.semester - b.semester || a.month - b.month)
    );
    // A usable plan covers at least the current semester with a few milestones
    if (drafts.length >= 3 && drafts.some((d) => d.semester === fromSemester)) {
      return { drafts, generatedBy: 'ai' };
    }
    throw new Error('AI plan was empty or incomplete');
  } catch (err) {
    console.warn('[journey] AI planner unavailable, using built-in plan:', err.message);
    return { drafts: buildTemplatePlan(profile, fromSemester), generatedBy: 'template' };
  }
}

function draftToMilestone(profile, draftItem, origin = 'plan', reason = '') {
  return {
    title: draftItem.title,
    description: draftItem.description || '',
    semester: draftItem.semester,
    category: draftItem.category,
    tool: draftItem.tool,
    toolTopic: draftItem.toolTopic || '',
    priority: draftItem.priority || 'core',
    dueAt: dueDate(profile, draftItem.semester, draftItem.month),
    status: 'pending',
    origin,
    reason,
  };
}

// ─── Change log ─────────────────────────────────────────────────────────────

function logChange(plan, trigger, summary, changes, at = new Date()) {
  plan.changeLog.push({ at, trigger, summary: clip(summary, 400), changes });
  if (plan.changeLog.length > MAX_CHANGE_LOG) {
    plan.changeLog.splice(0, plan.changeLog.length - MAX_CHANGE_LOG);
  }
}

// ─── Operations ─────────────────────────────────────────────────────────────

function findMilestone(plan, ref) {
  if (!ref) return null;
  const byId = plan.milestones.find((m) => m._id && String(m._id) === String(ref));
  if (byId) return byId;

  const needle = String(ref).trim().toLowerCase();
  if (!needle) return null;
  return (
    plan.milestones.find((m) => isOpen(m) && m.title.toLowerCase() === needle) ||
    plan.milestones.find((m) => isOpen(m) && m.title.toLowerCase().includes(needle)) ||
    null
  );
}

function hasOpenTitle(plan, title) {
  const needle = String(title).trim().toLowerCase();
  return plan.milestones.some((m) => isOpen(m) && m.title.toLowerCase() === needle);
}

/**
 * Apply plan operations and return the list of changes made.
 * Unknown or invalid operations are ignored, so AI output cannot corrupt the plan.
 *
 * Operations:
 *   { op: 'add', title, description, category, tool, toolTopic, priority, dueInDays | dueAt, origin, reason }
 *   { op: 'complete' | 'skip', ref, reason }
 *   { op: 'start', ref }
 *   { op: 'move', ref, dueInDays, reason }
 *   { op: 'update', ref, title, description, tool, toolTopic, reason }
 */
function applyOps(profile, plan, ops, now = journeyNow(profile)) {
  const changes = [];
  const semesterNow = currentSemester(profile, now);

  for (const op of Array.isArray(ops) ? ops : []) {
    if (!op || typeof op !== 'object') continue;
    const reason = clip(op.reason, 300);

    if (op.op === 'add') {
      const title = clip(op.title, 140);
      if (!title || hasOpenTitle(plan, title)) continue;
      const dueInDays = Math.min(365, Math.max(1, Math.round(Number(op.dueInDays)) || 14));
      // A fixed date (a mentor's deadline) is kept as given; relative ones avoid exam weeks
      const fixedDue = op.dueAt ? new Date(op.dueAt) : null;
      const dueAt = fixedDue && !Number.isNaN(fixedDue.getTime()) ? fixedDue : shiftOutOfExams(profile, addDays(now, dueInDays));
      plan.milestones.push({
        title,
        description: clip(op.description, 500),
        semester: semesterNow,
        category: CATEGORIES.includes(op.category) ? op.category : 'skills',
        // Only class work may point at a class; the planner and companion use the tools list
        tool: TOOLS.includes(op.tool) || (op.tool === 'classwork' && op.origin === 'mentor') ? op.tool : 'none',
        toolTopic: clip(op.toolTopic, 120),
        priority: op.priority === 'stretch' ? 'stretch' : 'core',
        dueAt,
        status: 'pending',
        origin: ['remedial', 'companion', 'replan', 'mentor'].includes(op.origin) ? op.origin : 'companion',
        reason,
      });
      changes.push({ action: 'add', title, detail: reason });
      continue;
    }

    const milestone = findMilestone(plan, op.ref);
    if (!milestone) continue;
    // Class assignments change only through the class (op.fromClass), never the companion or rules
    if (milestone.origin === 'mentor' && !op.fromClass && op.op !== 'start') continue;

    if (op.op === 'complete' && milestone.status !== 'done') {
      milestone.status = 'done';
      milestone.completedAt = now;
      changes.push({ action: 'complete', title: milestone.title, detail: reason });
    } else if (op.op === 'skip' && isOpen(milestone)) {
      milestone.status = 'skipped';
      milestone.reason = reason || milestone.reason;
      changes.push({ action: 'skip', title: milestone.title, detail: reason });
    } else if (op.op === 'start' && milestone.status === 'pending') {
      milestone.status = 'in_progress';
    } else if (op.op === 'move' && isOpen(milestone)) {
      const dueInDays = Math.min(365, Math.max(1, Math.round(Number(op.dueInDays)) || 14));
      const previous = milestone.dueAt;
      milestone.dueAt = shiftOutOfExams(profile, addDays(now, dueInDays));
      milestone.semester = Math.max(milestone.semester, semesterNow);
      changes.push({
        action: 'move',
        title: milestone.title,
        detail: `${formatDate(previous)} to ${formatDate(milestone.dueAt)}${reason ? `. ${reason}` : ''}`,
      });
    } else if (op.op === 'update' && isOpen(milestone)) {
      const before = milestone.title;
      if (op.title) milestone.title = clip(op.title, 140);
      if (op.description) milestone.description = clip(op.description, 500);
      if (TOOLS.includes(op.tool)) milestone.tool = op.tool;
      if (op.toolTopic !== undefined) milestone.toolTopic = clip(op.toolTopic, 120);
      changes.push({ action: 'update', title: before, detail: reason });
    }
  }

  return changes;
}

// ─── Rules: evidence changes the plan ───────────────────────────────────────

function tokens(text) {
  return String(text || '')
    .toLowerCase()
    .split(/[^a-z0-9+#]+/)
    .filter((t) => t.length > 2 && !['and', 'the', 'for', 'with', 'basics', 'learn'].includes(t));
}

function topicsMatch(a, b) {
  const left = tokens(a);
  const right = new Set(tokens(b));
  return left.length > 0 && left.some((t) => right.has(t));
}

function earliestOpen(plan, predicate) {
  return plan.milestones
    .filter((m) => isOpen(m) && predicate(m))
    .sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt))[0];
}

/**
 * Turn one piece of evidence into plan operations.
 * Kept rule-based on purpose: every adjustment can be explained in one sentence.
 */
function opsForEvidence(plan, event) {
  const ops = [];
  const score = event.score;
  const hasScore = typeof score === 'number';
  const meta = event.meta || {};

  switch (event.type) {
    case 'interview_completed': {
      const target = earliestOpen(plan, (m) => m.tool === 'mock_interview');
      if (target) {
        ops.push({ op: 'complete', ref: target._id, reason: `Done through your mock interview (${score}/100).` });
      }
      if (hasScore && score < 50) {
        const weakness = Array.isArray(meta.weaknesses) && meta.weaknesses[0] ? ` Focus: ${clip(meta.weaknesses[0], 120)}` : '';
        ops.push({
          op: 'add',
          title: `Retake a mock interview for ${event.topic || 'your role'}`,
          description: `Your last interview scored ${score}/100.${weakness}`,
          category: 'career',
          tool: 'mock_interview',
          toolTopic: event.topic || '',
          dueInDays: 14,
          origin: 'remedial',
          reason: `Mock interview scored ${score}/100, below the 50 needed to move on.`,
        });
      }
      break;
    }

    case 'resume_analyzed': {
      const target = earliestOpen(plan, (m) => m.tool === 'resume_analyzer');
      if (hasScore && score >= 70) {
        if (target) ops.push({ op: 'complete', ref: target._id, reason: `Resume scored ${score}/100.` });
      } else if (hasScore) {
        if (target) ops.push({ op: 'start', ref: target._id });
        const missing = Array.isArray(meta.missingKeywords) ? meta.missingKeywords.slice(0, 4).join(', ') : '';
        ops.push({
          op: 'add',
          title: 'Fix the gaps in your resume',
          description: missing ? `Add evidence for: ${missing}. Then analyse again.` : 'Fix what the analyzer flagged, then analyse again.',
          category: 'career',
          tool: 'resume_builder',
          dueInDays: 10,
          origin: 'remedial',
          reason: `Resume scored ${score}/100, below the 70 target.`,
        });
      }
      break;
    }

    case 'resume_generated': {
      const target = earliestOpen(plan, (m) => m.tool === 'resume_builder');
      if (target) ops.push({ op: 'complete', ref: target._id, reason: 'Done by saving a resume in the builder.' });
      break;
    }

    case 'quiz_completed': {
      const fromLab = meta.source === 'lab';
      if (fromLab && hasScore && score >= 70) {
        const target = earliestOpen(plan, (m) => m.tool === 'practice' && topicsMatch(m.toolTopic || m.title, event.topic));
        if (target) ops.push({ op: 'complete', ref: target._id, reason: `Practice Lab score ${score}/100.` });
      }
      if (hasScore && score < 50 && event.topic) {
        ops.push({
          op: 'add',
          title: `Revise ${clip(event.topic, 100)}`,
          description: fromLab
            ? `You scored ${score}/100 in the Practice Lab. Another set will focus on the concepts you missed.`
            : `You scored ${score}/100 on the quiz. Revise with flashcards, then retake it.`,
          category: 'academics',
          tool: fromLab ? 'practice' : 'flashcards',
          toolTopic: event.topic,
          dueInDays: 7,
          origin: 'remedial',
          reason: `Quiz on ${clip(event.topic, 80)} scored ${score}/100.`,
        });
      }
      break;
    }

    case 'dsa_solved': {
      // A pattern counts as done once its measured level reaches 70
      const target = earliestOpen(plan, (m) => m.tool === 'dsa'
        && (m.toolTopic === meta.pattern || topicsMatch(m.toolTopic || m.title, event.topic)));
      if (target) {
        if (Number(meta.patternLevel) >= 70) {
          ops.push({ op: 'complete', ref: target._id, reason: `${clip(event.topic, 60)} is at level ${meta.patternLevel}/100.` });
        } else {
          ops.push({ op: 'start', ref: target._id });
        }
      }
      break;
    }

    case 'roadmap_node_completed': {
      const target = earliestOpen(plan, (m) => m.tool === 'roadmap' && topicsMatch(m.toolTopic || m.title, event.topic));
      if (target) ops.push({ op: 'start', ref: target._id });
      break;
    }

    case 'roadmap_completed': {
      const target = earliestOpen(plan, (m) => m.tool === 'roadmap' && topicsMatch(m.toolTopic || m.title, event.topic));
      if (target) ops.push({ op: 'complete', ref: target._id, reason: `Done by finishing the "${clip(event.topic, 80)}" roadmap.` });
      break;
    }

    case 'tutor_chapter_completed': {
      const target = earliestOpen(plan, (m) => m.tool === 'tutor' && topicsMatch(m.toolTopic || m.title, event.topic));
      if (target) ops.push({ op: 'start', ref: target._id });
      break;
    }

    default:
      break;
  }

  return ops;
}

function applyEvidence(profile, plan, event, now = journeyNow(profile)) {
  const changes = applyOps(profile, plan, opsForEvidence(plan, event), now);
  if (changes.length > 0) {
    logChange(plan, 'evidence', evidenceSummary(event), changes, now);
  }
  return changes;
}

function evidenceSummary(event) {
  const score = typeof event.score === 'number' ? ` (${event.score}/100)` : '';
  const label = {
    interview_completed: 'Mock interview',
    resume_analyzed: 'Resume analysis',
    resume_generated: 'Resume saved',
    dsa_solved: 'DSA problem solved',
    quiz_completed: 'Quiz',
    roadmap_completed: 'Roadmap finished',
  }[event.type] || 'Activity';
  return `${label}${event.topic ? `: ${clip(event.topic, 80)}` : ''}${score} changed your plan.`;
}

// ─── Rules: time changes the plan ───────────────────────────────────────────

/**
 * Reschedule or drop milestones that are past due, and note a move to a new year.
 * Returns true when the plan changed.
 */
function syncWithClock(profile, plan, now = journeyNow(profile)) {
  let changed = false;
  const semesterNow = currentSemester(profile, now);
  const yearNow = yearOfSemester(semesterNow);

  if (yearNow > (plan.stageYear || 1)) {
    const stage = stageFor(yearNow);
    logChange(
      plan,
      'new_year',
      `You are now in year ${yearNow}. Your companion has switched to "${stage.name}" mode.`,
      [{ action: 'mode', title: `Year ${yearNow}: ${stage.name}`, detail: stage.focus }],
      now
    );
    plan.stageYear = yearNow;
    changed = true;
  }

  const cutoff = addDays(now, -OVERDUE_GRACE_DAYS);
  const overdue = plan.milestones
    // A mentor's deadline is not ours to move; the class shows it as late instead
    .filter((m) => isOpen(m) && m.origin !== 'mentor' && new Date(m.dueAt) < cutoff)
    .sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt));

  if (overdue.length > 0) {
    const changes = [];
    let moved = 0;
    let dropped = 0;

    overdue.forEach((milestone) => {
      milestone.slipCount = (milestone.slipCount || 0) + 1;

      // Optional work that keeps slipping is dropped so core work still fits
      if (milestone.priority === 'stretch' && milestone.slipCount >= 2) {
        milestone.status = 'skipped';
        milestone.reason = 'Dropped after slipping twice, to keep room for core work.';
        changes.push({ action: 'skip', title: milestone.title, detail: milestone.reason });
        dropped += 1;
        return;
      }

      const previous = milestone.dueAt;
      // Spread the rescheduled work out instead of stacking it on one day, and never into exams
      milestone.dueAt = shiftOutOfExams(profile, addDays(now, 14 + moved * 7));
      milestone.semester = Math.max(milestone.semester, semesterNow);
      changes.push({
        action: 'move',
        title: milestone.title,
        detail: `Was due ${formatDate(previous)}, now due ${formatDate(milestone.dueAt)}.`,
      });
      moved += 1;
    });

    const parts = [];
    if (moved) parts.push(`rescheduled ${moved}`);
    if (dropped) parts.push(`dropped ${dropped} optional`);
    logChange(
      plan,
      'overdue',
      `${overdue.length} milestone${overdue.length > 1 ? 's were' : ' was'} past due: ${parts.join(', ')}.`,
      changes,
      now
    );
    changed = true;
  }

  return changed;
}

// ─── Rebuild ────────────────────────────────────────────────────────────────

/**
 * Replace every milestone that has not been started with a freshly generated
 * plan from the current semester. Finished and in-progress work is kept.
 */
async function rebuildFuture(profile, plan, trigger, summary) {
  const now = journeyNow(profile);
  const semesterNow = currentSemester(profile, now);
  const { drafts, generatedBy } = await generateDrafts(profile, semesterNow);

  // Work set by a mentor's class stays until the class says otherwise
  const kept = plan.milestones.filter((m) => m.status !== 'pending' || m.origin === 'mentor');
  const removed = plan.milestones.filter((m) => m.status === 'pending' && m.origin !== 'mentor');
  const keptTitles = new Set(kept.map((m) => m.title.toLowerCase()));

  const fresh = drafts
    .filter((d) => !keptTitles.has(d.title.toLowerCase()))
    .map((d) => {
      const milestone = draftToMilestone(profile, d, 'replan', summary);
      // Nothing new may be due in the past
      if (new Date(milestone.dueAt) < now) milestone.dueAt = addDays(now, 14);
      return milestone;
    });

  const removedTitles = new Set(removed.map((m) => m.title.toLowerCase()));
  const freshTitles = new Set(fresh.map((m) => m.title.toLowerCase()));
  const changes = [
    ...removed
      .filter((m) => !freshTitles.has(m.title.toLowerCase()))
      .map((m) => ({ action: 'remove', title: m.title, detail: 'No longer fits the new plan.' })),
    ...fresh
      .filter((m) => !removedTitles.has(m.title.toLowerCase()))
      .map((m) => ({ action: 'add', title: m.title, detail: `Semester ${m.semester}` })),
  ];

  plan.milestones = [...kept, ...fresh];
  plan.generatedBy = generatedBy;
  logChange(plan, trigger, summary, changes.slice(0, 30), now);
  return changes;
}

async function createPlan(candidate, profile) {
  const now = journeyNow(profile);
  const semesterNow = currentSemester(profile, now);
  const { drafts, generatedBy } = await generateDrafts(profile, semesterNow);
  const stage = stageFor(yearOfSemester(semesterNow));

  const plan = new JourneyPlan({
    candidate: candidate._id,
    clerkId: candidate.clerkId,
    generatedBy,
    stageYear: yearOfSemester(semesterNow),
    milestones: drafts.map((d) => draftToMilestone(profile, d)),
    changeLog: [],
  });
  logChange(
    plan,
    'setup',
    `Plan created from semester ${semesterNow} to ${TOTAL_SEMESTERS} for ${profile.branch}. You start in "${stage.name}" mode.`,
    [],
    now
  );
  return plan;
}

module.exports = {
  TOOLS,
  CATEGORIES,
  isOpen,
  generateDrafts,
  draftToMilestone,
  logChange,
  applyOps,
  opsForEvidence,
  applyEvidence,
  syncWithClock,
  rebuildFuture,
  createPlan,
  findMilestone,
  formatDate,
  shiftOutOfExams,
};
