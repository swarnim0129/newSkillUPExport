// Exam periods: when the student adds one, the plan clears that window and
// adds a revision milestone just before it.

const { applyOps, logChange, isOpen, formatDate } = require('./planService');
const { journeyNow, addDays, DAY_MS } = require('./clock');

const MAX_EXAM_DAYS = 45;

function validateExam(input, now) {
  const title = String((input && input.title) || '').trim().slice(0, 80);
  const startAt = new Date(input && input.startAt);
  const endAt = new Date(input && input.endAt);
  if (!title) return { error: 'Give the exam a name' };
  if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) return { error: 'Choose a start and end date' };
  if (endAt < startAt) return { error: 'The exam cannot end before it starts' };
  if ((endAt - startAt) / DAY_MS > MAX_EXAM_DAYS) return { error: `An exam period can be at most ${MAX_EXAM_DAYS} days` };
  if (endAt < addDays(now, -1)) return { error: 'That exam is already over' };
  return { exam: { title, startAt, endAt } };
}

/**
 * Add an exam period and move planned work out of it. Mutates profile and plan;
 * returns the plan changes.
 */
function addExam(profile, plan, input) {
  const now = journeyNow(profile);
  const { exam, error } = validateExam(input, now);
  if (error) return { error };

  const windowStart = addDays(exam.startAt, -2);
  const windowEnd = new Date(exam.endAt);
  const clashing = plan.milestones
    .filter((m) => isOpen(m) && new Date(m.dueAt) >= windowStart && new Date(m.dueAt) <= windowEnd)
    .sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt));

  const changes = [];
  clashing.forEach((milestone, i) => {
    const previous = milestone.dueAt;
    // Spread the moved work over the days after the exam
    milestone.dueAt = addDays(windowEnd, 3 + i * 2);
    changes.push({
      action: 'move',
      title: milestone.title,
      detail: `Was due ${formatDate(previous)} during ${exam.title}; now ${formatDate(milestone.dueAt)}.`,
    });
  });

  const daysUntil = Math.round((new Date(exam.startAt) - now) / DAY_MS);
  if (daysUntil >= 3) {
    changes.push(...applyOps(profile, plan, [{
      op: 'add',
      title: `Revise for ${exam.title}`,
      description: 'Make a revision sheet of formulas, definitions and past questions, then practise with flashcards.',
      category: 'academics',
      tool: 'flashcards',
      toolTopic: exam.title,
      dueInDays: Math.max(1, daysUntil - 1),
      origin: 'companion',
      reason: `${exam.title} starts ${formatDate(exam.startAt)}.`,
    }], now));
  }

  // Added last: the revision milestone sits just before the exam on purpose,
  // and the exam window would otherwise push it to after the exam
  profile.exams = [...(profile.exams || []), exam];

  logChange(
    plan,
    'exam',
    `${exam.title} (${formatDate(exam.startAt)} to ${formatDate(exam.endAt)}): ${clashing.length ? `moved ${clashing.length} milestone${clashing.length > 1 ? 's' : ''} out of the exam period` : 'nothing was due during it'}.`,
    changes,
    now
  );
  return { changes, exam: profile.exams[profile.exams.length - 1] };
}

function removeExam(profile, examId) {
  const before = (profile.exams || []).length;
  profile.exams = (profile.exams || []).filter((e) => String(e._id) !== String(examId));
  return profile.exams.length !== before;
}

function upcomingExams(profile, now = journeyNow(profile), days = 60) {
  const until = addDays(now, days);
  return (profile.exams || [])
    .filter((e) => new Date(e.endAt) >= now && new Date(e.startAt) <= until)
    .sort((a, b) => new Date(a.startAt) - new Date(b.startAt));
}

module.exports = { validateExam, addExam, removeExam, upcomingExams };
