// The companion: one ongoing conversation per student. It reads the profile, the
// plan and recent results before every answer, and it can change the plan.

const CompanionMessage = require('../models/CompanionMessage');
const StudentEvent = require('../models/StudentEvent');
const PracticeProgress = require('../models/PracticeProgress');
const PracticeAttempt = require('../models/PracticeAttempt');
const { patternOverview, dueReviews } = require('./practice/masteryService');
const { MISTAKE_LABELS } = require('./practice/coachService');
const { forecast } = require('./journey/forecastService');
const { upcomingExams } = require('./journey/examService');
const { generateJson } = require('./aiJson');
const { applyOps, logChange, rebuildFuture, isOpen, formatDate } = require('./journey/planService');
const { journeyNow, addDays, currentSemester, yearOfSemester, stageFor, DAY_MS } = require('./journey/clock');

const CHECK_IN_EVERY_DAYS = 7;
const HISTORY_MESSAGES = 12;
const MAX_MEMORY_FACTS = 40;
const GOAL_TYPES = ['placement', 'higher_studies', 'govt_exam', 'startup', 'undecided'];

const EVENT_LABELS = {
  quiz_completed: 'Quiz',
  tutor_chapter_completed: 'Tutor chapter',
  roadmap_node_completed: 'Roadmap topic',
  roadmap_completed: 'Roadmap finished',
  interview_completed: 'Mock interview',
  resume_analyzed: 'Resume analysis',
  resume_generated: 'Resume saved',
  milestone_done: 'Milestone done',
};

function describeEvent(event) {
  const score = typeof event.score === 'number' ? ` — ${event.score}/100` : '';
  return `${EVENT_LABELS[event.type] || event.type}${event.topic ? `: ${event.topic}` : ''}${score}`;
}

/**
 * Everything the companion needs to know about the student right now.
 */
async function loadSnapshot(profile, plan) {
  const now = journeyNow(profile);
  const semester = currentSemester(profile, now);
  const year = yearOfSemester(semester);
  const open = plan.milestones.filter(isOpen).sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt));

  const [recentEvents, progress, failed] = await Promise.all([
    StudentEvent.find({ candidate: profile.candidate }).sort({ occurredAt: -1 }).limit(10).lean(),
    PracticeProgress.find({ candidate: profile.candidate }).lean(),
    PracticeAttempt.find({ candidate: profile.candidate, passed: false, 'mistake.type': { $exists: true } })
      .sort({ occurredAt: -1 }).limit(10).select('mistake.type').lean(),
  ]);

  // Practice, exams and forecast, so the companion talks about all of the student's work
  const overview = patternOverview(progress, now);
  const mistakeCounts = {};
  failed.forEach((a) => {
    if (a.mistake.type !== 'syntax_error') mistakeCounts[a.mistake.type] = (mistakeCounts[a.mistake.type] || 0) + 1;
  });
  const readOnly = { ...profile.toObject(), readinessHistory: [...(profile.readinessHistory || [])].map((h) => ({ at: h.at, value: h.value })) };
  const fc = forecast(readOnly, plan, overview.levels, now);

  return {
    practice: {
      dueReviews: dueReviews(progress, now),
      learning: overview.patterns.filter((pt) => pt.status === 'learning').map((pt) => `${pt.name} ${pt.level}`),
      mastered: overview.patterns.filter((pt) => pt.status === 'mastered').map((pt) => pt.name),
      solved: progress.filter((pr) => pr.solved).length,
      mistakes: Object.entries(mistakeCounts).sort((a, b) => b[1] - a[1]).map(([type, count]) => `${MISTAKE_LABELS[type]} x${count}`),
    },
    exams: upcomingExams(profile, now),
    forecast: fc,
    now,
    semester,
    year,
    stage: stageFor(year),
    open,
    overdue: open.filter((m) => new Date(m.dueAt) < now),
    thisSemester: open.filter((m) => m.semester <= semester),
    later: open.filter((m) => m.semester > semester),
    done: plan.milestones.filter((m) => m.status === 'done'),
    recentEvents,
    skills: [...(profile.skills || [])].sort((a, b) => b.level - a.level),
  };
}

// ─── Widgets: what the chat shows as cards ──────────────────────────────────
// Each companion message carries a short list of typed cards so the chat reads
// like a dashboard, not a wall of text:
//   headline { title, text }            points { title, style: bullets|steps, items }
//   stats { items: [{label, value, hint}] }
//   milestones { title, items: [{id, title, dueAt, overdue, tool, toolTopic, origin}] }
//   alert { tone: warn|info|good, text }  next { title, text, tool, toolTopic }
//   plan_changes { items: [{action, title, detail}] }

const LINKABLE_TOOLS = ['roadmap', 'tutor', 'flashcards', 'resume_analyzer', 'resume_builder', 'mock_interview', 'dsa', 'practice', 'classwork', 'companion'];

function milestoneItem(m, now) {
  return {
    id: String(m._id),
    title: m.title,
    dueAt: m.dueAt,
    overdue: new Date(m.dueAt) < now,
    tool: m.tool,
    toolTopic: m.toolTopic || '',
    origin: m.origin,
  };
}

function nextWidget(milestone, title = 'Next step') {
  return {
    type: 'next',
    title,
    text: `${milestone.title}, due ${formatDate(milestone.dueAt)}`,
    tool: milestone.tool,
    toolTopic: milestone.toolTopic || '',
  };
}

function textOf(widgets) {
  return widgets
    .map((w) => {
      if (w.type === 'headline') return [w.title, w.text].filter(Boolean).join('\n');
      if (w.type === 'points') return w.items.map((i, n) => `${w.style === 'steps' ? `${n + 1}.` : '-'} ${i}`).join('\n');
      if (w.type === 'alert') return w.text;
      if (w.type === 'next') return `${w.title}: ${w.text}`;
      if (w.type === 'stats') return w.items.map((i) => `${i.label}: ${i.value}`).join(' · ');
      if (w.type === 'milestones') return `${w.title}: ${w.items.map((i) => i.title).join('; ')}`;
      return '';
    })
    .filter(Boolean)
    .join('\n\n')
    .slice(0, 6000);
}

// ─── Check-in: the companion speaks first ───────────────────────────────────

function isCheckInDue(profile, now) {
  if (!profile.lastCheckInAt) return false; // the welcome message covers the first visit
  return now.getTime() - new Date(profile.lastCheckInAt).getTime() >= CHECK_IN_EVERY_DAYS * DAY_MS;
}

/**
 * Built from the student's own data, without the AI model, so a check-in is
 * always available and always factual.
 */
function composeCheckIn(profile, plan, snapshot, firstName) {
  const { now, stage, year, overdue, thisSemester, skills, recentEvents } = snapshot;
  const since = profile.lastCheckInAt ? new Date(profile.lastCheckInAt) : addDays(now, -CHECK_IN_EVERY_DAYS);
  const lines = [];

  lines.push(`Hi ${firstName}, weekly check-in. You are in year ${year}, "${stage.name}" mode.`);

  const finished = plan.milestones.filter((m) => m.status === 'done' && m.completedAt && new Date(m.completedAt) >= since);
  const activity = recentEvents.filter((e) => new Date(e.occurredAt) >= since);
  if (finished.length > 0) {
    lines.push(`Since we last spoke you finished: ${finished.map((m) => m.title).slice(0, 3).join('; ')}.`);
  } else if (activity.length > 0) {
    lines.push(`Since we last spoke: ${activity.slice(0, 3).map(describeEvent).join('; ')}.`);
  } else {
    lines.push('I have not seen any activity since we last spoke. If something got in the way, tell me and I will adjust the plan.');
  }

  const recentChange = [...plan.changeLog].reverse().find((c) => new Date(c.at) >= since && c.trigger !== 'setup');
  if (recentChange) lines.push(`Plan update: ${recentChange.summary}`);

  if (overdue.length > 0) {
    lines.push(`${overdue.length} milestone${overdue.length > 1 ? 's are' : ' is'} past due, starting with "${overdue[0].title}".`);
  }

  const practice = snapshot.practice || { dueReviews: [] };
  if (practice.dueReviews.length) {
    lines.push(`${practice.dueReviews.length} DSA problem${practice.dueReviews.length > 1 ? 's are' : ' is'} due for review, starting with "${practice.dueReviews[0].title}". Reviews keep your pattern levels from fading.`);
  }
  const exam = (snapshot.exams || [])[0];
  if (exam) {
    lines.push(`${exam.title} starts ${formatDate(exam.startAt)}. I have kept the plan clear during it.`);
  }
  if (snapshot.forecast && snapshot.forecast.projected !== null) {
    lines.push(`Forecast: readiness ${snapshot.forecast.now} today, heading for ${snapshot.forecast.projected} by ${snapshot.forecast.target.label}.`);
  }

  const weakest = skills.filter((s) => s.evidenceCount > 0).sort((a, b) => a.level - b.level)[0];
  if (weakest && weakest.level < 60) {
    lines.push(`Your weakest measured area is ${weakest.name} at ${weakest.level}/100.`);
  }

  const next = thisSemester[0] || snapshot.open[0];
  if (next) {
    lines.push(`Next up: "${next.title}", due ${formatDate(next.dueAt)}. Can you give it time this week?`);
  } else {
    lines.push('You have cleared everything planned so far. Tell me what you want to aim for next.');
  }

  return lines.join('\n\n');
}

function checkInWidgets(profile, plan, snapshot, firstName) {
  const { now, stage, year, overdue, thisSemester, skills, recentEvents } = snapshot;
  const since = profile.lastCheckInAt ? new Date(profile.lastCheckInAt) : addDays(now, -CHECK_IN_EVERY_DAYS);
  const widgets = [{ type: 'headline', title: `Weekly check-in, ${firstName}`, text: `Year ${year} · ${stage.name} mode` }];

  const fc = snapshot.forecast;
  const practice = snapshot.practice || { dueReviews: [], solved: 0 };
  widgets.push({
    type: 'stats',
    items: [
      { label: 'Readiness', value: `${fc ? fc.now : 0}`, hint: fc && fc.projected !== null ? `Heading for ${fc.projected} by ${fc.target.label}` : 'Out of 100' },
      { label: 'Past due', value: `${overdue.length}`, hint: overdue.length ? 'Milestones' : 'All on time' },
      { label: 'Reviews due', value: `${practice.dueReviews.length}`, hint: 'DSA problems' },
    ],
  });

  const finished = plan.milestones.filter((m) => m.status === 'done' && m.completedAt && new Date(m.completedAt) >= since);
  const activity = recentEvents.filter((e) => new Date(e.occurredAt) >= since);
  if (finished.length) {
    widgets.push({ type: 'points', title: 'Since we last spoke you finished', style: 'bullets', items: finished.slice(0, 4).map((m) => m.title) });
  } else if (activity.length) {
    widgets.push({ type: 'points', title: 'Since we last spoke', style: 'bullets', items: activity.slice(0, 4).map(describeEvent) });
  } else {
    widgets.push({ type: 'alert', tone: 'info', text: 'No activity since we last spoke. If something got in the way, tell me and I will adjust the plan.' });
  }

  const recentChange = [...plan.changeLog].reverse().find((c) => new Date(c.at) >= since && c.trigger !== 'setup');
  if (recentChange) widgets.push({ type: 'alert', tone: 'info', text: `Plan update: ${recentChange.summary}` });

  if (overdue.length) {
    widgets.push({ type: 'milestones', title: 'Past due', items: overdue.slice(0, 3).map((m) => milestoneItem(m, now)) });
  }
  const exam = (snapshot.exams || [])[0];
  if (exam) widgets.push({ type: 'alert', tone: 'info', text: `${exam.title} starts ${formatDate(exam.startAt)}. The plan is kept clear during it.` });

  const weakest = skills.filter((sk) => sk.evidenceCount > 0).sort((a, b) => a.level - b.level)[0];
  if (weakest && weakest.level < 60) widgets.push({ type: 'alert', tone: 'warn', text: `Weakest measured area: ${weakest.name} at ${weakest.level}/100.` });

  const next = thisSemester[0] || snapshot.open[0];
  if (next) widgets.push(nextWidget(next, 'Next up this week'));
  else widgets.push({ type: 'alert', tone: 'good', text: 'Everything planned so far is done. Tell me what you want to aim for next.' });
  return widgets;
}

/** Burnout guard (only when the student turned it on): a gentle warning in the check-in. */
async function withWellbeing(widgets, profile, plan) {
  if (!(profile.wellbeing && profile.wellbeing.optIn)) return widgets;
  try {
    const { wellbeing } = require('./insightsService');
    const w = await wellbeing(profile, plan);
    if (w.level === 'steady') return widgets;
    const alert = { type: 'alert', tone: 'warn', text: `Burnout guard: you look ${w.level}. ${w.signals[0] ? w.signals[0].label + ' ' : ''}${w.advice}` };
    return [widgets[0], alert, ...widgets.slice(1)];
  } catch (err) {
    console.warn('[companion] wellbeing check failed:', err.message);
    return widgets;
  }
}

async function ensureCheckIn(candidate, profile, plan, firstName) {
  const now = journeyNow(profile);
  if (!isCheckInDue(profile, now)) return null;

  const snapshot = await loadSnapshot(profile, plan);
  const message = await CompanionMessage.create({
    candidate: candidate._id,
    clerkId: candidate.clerkId,
    role: 'companion',
    kind: 'checkin',
    content: composeCheckIn(profile, plan, snapshot, firstName),
    widgets: await withWellbeing(checkInWidgets(profile, plan, snapshot, firstName), profile, plan),
  });
  profile.lastCheckInAt = now;
  await profile.save();
  return message;
}

function composeWelcome(profile, plan, firstName) {
  const now = journeyNow(profile);
  const semester = currentSemester(profile, now);
  const stage = stageFor(yearOfSemester(semester));
  const first = plan.milestones.filter(isOpen).sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt))[0];
  const goal = profile.goal && profile.goal.type !== 'undecided'
    ? `Your goal is ${profile.goal.type.replace('_', ' ')}${profile.goal.targetRole ? ` as ${profile.goal.targetRole}` : ''}.`
    : 'You have not fixed a goal yet, which is fine at this stage. We will narrow it down together.';

  return [
    `Hi ${firstName}, I am your companion for the rest of your ${profile.degree}. I will stay with you until you graduate.`,
    `You are in semester ${semester} of ${profile.branch}, so we start in "${stage.name}" mode: ${stage.focus}`,
    goal,
    `I have built your plan up to final year. It will change as I see your quiz, interview and resume results, and I will always tell you what changed and why.`,
    first ? `First step: "${first.title}", due ${formatDate(first.dueAt)}.` : '',
    'Tell me anything that affects your studies, such as exams, a part-time job, or a change of mind about your goal, and I will remember it.',
  ]
    .filter(Boolean)
    .join('\n\n');
}

function welcomeWidgets(profile, plan, firstName) {
  const now = journeyNow(profile);
  const semester = currentSemester(profile, now);
  const stage = stageFor(yearOfSemester(semester));
  const open = plan.milestones.filter(isOpen).sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt));
  const goal = profile.goal && profile.goal.type !== 'undecided'
    ? `Goal: ${profile.goal.type.replace('_', ' ')}${profile.goal.targetRole ? ` as ${profile.goal.targetRole}` : ''}.`
    : 'No goal fixed yet. That is fine at this stage; we will narrow it down together.';
  const widgets = [
    { type: 'headline', title: `Hi ${firstName}, I am your companion`, text: `I stay with you until you finish your ${profile.degree}. Semester ${semester} of ${profile.branch}, so we start in ${stage.name} mode.` },
    { type: 'points', title: 'How I work', style: 'bullets', items: [
      stage.focus,
      goal,
      'Your plan runs to final year and changes with your quiz, interview and resume results. I always say what changed and why.',
      'Tell me about exams, a part-time job or a change of mind, and I will remember it.',
    ] },
  ];
  if (open.length) widgets.push({ type: 'milestones', title: 'Your first steps', items: open.slice(0, 3).map((m) => milestoneItem(m, now)) });
  return widgets;
}

// ─── Replies ────────────────────────────────────────────────────────────────

function replyPrompt(profile, snapshot, history, message, firstName) {
  const { now, semester, year, stage, overdue, thisSemester, later, done, recentEvents, skills } = snapshot;
  const goal = profile.goal || {};
  const line = (m) => `- [${m._id}] ${m.title} (tool: ${m.tool}, due ${formatDate(m.dueAt)}, ${m.status}${m.priority === 'stretch' ? ', optional' : ''})`;

  return `You are the long-term study and career companion of ${firstName}, an engineering student, on the SkillUp platform. You have been with this student since they set up their journey and you manage their plan until graduation. You are not a general chatbot: every answer uses this student's own data below.

HOW TO BEHAVE NOW — year ${year}, "${stage.name}" mode
${stage.companionStyle}

STUDENT
- ${profile.degree} in ${profile.branch}${profile.college ? ` at ${profile.college}` : ''}, semester ${semester} of 8
- Goal: ${goal.type || 'undecided'}${goal.targetRole ? `, target role ${goal.targetRole}` : ''}${goal.note ? ` (${goal.note})` : ''}
- Time: ${profile.hoursPerWeek} hours a week
- Interests: ${(profile.interests || []).join(', ') || 'not given'}
- Today: ${formatDate(now)}

WHAT YOU REMEMBER ABOUT THEM
${(profile.memory || []).map((m) => `- ${m.text}`).join('\n') || '- nothing saved yet'}

SKILL LEVELS (measured from their real results, 0-100)
${skills.map((s) => `- ${s.name}: ${s.level}${s.evidenceCount ? ` (${s.evidenceCount} tested result${s.evidenceCount > 1 ? 's' : ''})` : ' (studied, not yet tested)'}`).join('\n') || '- nothing measured yet'}

PLAN — open milestones for now
${thisSemester.slice(0, 10).map(line).join('\n') || '- none'}
${overdue.length ? `\nPAST DUE: ${overdue.map((m) => m.title).join('; ')}` : ''}

PLAN — later semesters (titles only)
${later.slice(0, 12).map((m) => `- S${m.semester}: ${m.title}`).join('\n') || '- none'}

FINISHED SO FAR: ${done.length} milestone${done.length === 1 ? '' : 's'}${done.length ? ` (latest: ${done.slice(-3).map((m) => m.title).join('; ')})` : ''}

PRACTICE
- DSA problems solved: ${snapshot.practice.solved}; mastered patterns: ${snapshot.practice.mastered.join(', ') || 'none'}
- Patterns in progress (level): ${snapshot.practice.learning.join(', ') || 'none'}
- Reviews due: ${snapshot.practice.dueReviews.map((r) => r.title).join(', ') || 'none'}
- Repeated mistakes: ${snapshot.practice.mistakes.join(', ') || 'none'}

UPCOMING EXAMS
${snapshot.exams.map((e) => `- ${e.title}: ${formatDate(e.startAt)} to ${formatDate(e.endAt)}`).join('\n') || '- none entered'}

READINESS FORECAST
- Today ${snapshot.forecast.now}/100 for ${snapshot.forecast.target.label} (${snapshot.forecast.target.weeksLeft} weeks away). ${snapshot.forecast.verdict}

RECENT ACTIVITY
${recentEvents.map((e) => `- ${formatDate(e.occurredAt)}: ${describeEvent(e)}`).join('\n') || '- none yet'}

CONVERSATION SO FAR (oldest first)
${history.map((m) => `${m.role === 'user' ? firstName : 'You'}: ${m.content}`).join('\n') || '(this is the first message)'}

${firstName} SAYS: ${message}

Answer as JSON only. The chat shows your answer as small cards, so keep every field short, plain text, no markdown:
{
  "title": "headline, at most 8 words",
  "summary": "the direct answer in 1-2 sentences, at most 40 words, specific to their data",
  "points": ["0 to 4 items, each at most 18 words: steps, options or facts. Empty if the summary is enough."],
  "points_style": "steps when order matters, otherwise bullets",
  "next_step": {"text": "one concrete action for this week, at most 16 words", "milestone_id": "id in square brackets above if it is that milestone, else empty", "tool": "dsa|practice|roadmap|tutor|flashcards|resume_analyzer|resume_builder|mock_interview|none"},
  "remember": ["short facts worth keeping for years: constraints, preferences, life events, decisions. Empty if nothing new."],
  "plan_ops": [],
  "goal_update": null
}

plan_ops changes their plan. Use it only when they ask for a change or their situation clearly needs one (exams, illness, less time, new interest). Allowed operations:
- {"op":"add","title":"...","description":"...","category":"academics|skills|projects|career|placement|habits","tool":"roadmap|tutor|flashcards|resume_analyzer|resume_builder|mock_interview|companion|none","toolTopic":"...","priority":"core|stretch","dueInDays":14,"reason":"why"}
- {"op":"move","ref":"<milestone id>","dueInDays":21,"reason":"why"}
- {"op":"skip","ref":"<milestone id>","reason":"why"}
- {"op":"complete","ref":"<milestone id>","reason":"why"}
- {"op":"update","ref":"<milestone id>","title":"...","description":"...","reason":"why"}
"ref" must be an id shown in square brackets above. If you change the plan, say so in the summary.

goal_update is null unless they clearly state a new goal. Then use {"type":"placement|higher_studies|govt_exam|startup|undecided","targetRole":"..."}; their future plan will be rebuilt.`;
}

/**
 * Used when the AI model cannot be reached: still answers from the student's data.
 */
function fallbackWidgets(snapshot) {
  const { overdue, thisSemester, open, now } = snapshot;
  const next = thisSemester[0] || open[0];
  const widgets = [{ type: 'alert', tone: 'warn', text: 'I could not reach my language model just now, so here is where you stand from your plan. Ask again in a moment.' }];
  if (overdue.length) widgets.push({ type: 'milestones', title: 'Past due', items: overdue.slice(0, 3).map((m) => milestoneItem(m, now)) });
  if (next) widgets.push(nextWidget(next));
  return widgets;
}

const clean = (value, max) => String(value || '').replace(/\*\*|__|`|#+\s/g, '').trim().slice(0, max);

/** Turn the AI's JSON into cards, linking the next step to a real milestone when it names one. */
function replyWidgets(result, snapshot) {
  const widgets = [];
  const title = clean(result.title, 80);
  const summary = clean(result.summary || result.reply, 600);
  if (title || summary) widgets.push({ type: 'headline', title, text: summary });

  const points = (Array.isArray(result.points) ? result.points : []).map((p) => clean(p, 200)).filter(Boolean).slice(0, 5);
  if (points.length) widgets.push({ type: 'points', title: '', style: result.points_style === 'steps' ? 'steps' : 'bullets', items: points });

  const step = result.next_step && typeof result.next_step === 'object' ? result.next_step : null;
  if (step && clean(step.text, 200)) {
    const milestone = step.milestone_id ? snapshot.open.find((m) => String(m._id) === String(step.milestone_id)) : null;
    widgets.push({
      type: 'next',
      title: 'Next step',
      text: clean(step.text, 200),
      tool: milestone ? milestone.tool : (LINKABLE_TOOLS.includes(step.tool) ? step.tool : 'none'),
      toolTopic: milestone ? milestone.toolTopic || '' : '',
    });
  }
  return widgets;
}

function fallbackReply(snapshot) {
  const { overdue, thisSemester, open } = snapshot;
  const next = thisSemester[0] || open[0];
  const parts = ['I could not reach my language model just now, so here is where you stand from your plan.'];
  if (overdue.length) parts.push(`Past due: ${overdue.slice(0, 3).map((m) => m.title).join('; ')}.`);
  if (next) parts.push(`Next up: "${next.title}", due ${formatDate(next.dueAt)}.`);
  parts.push('Ask me again in a moment and I will answer properly.');
  return parts.join(' ');
}

function rememberFacts(profile, facts, now) {
  const saved = [];
  const known = new Set((profile.memory || []).map((m) => m.text.toLowerCase()));

  for (const fact of Array.isArray(facts) ? facts : []) {
    const text = String(fact || '').trim().slice(0, 300);
    if (!text || known.has(text.toLowerCase())) continue;
    profile.memory.push({ text, source: 'chat', createdAt: now });
    known.add(text.toLowerCase());
    saved.push(text);
  }

  // Oldest facts make room for new ones
  if (profile.memory.length > MAX_MEMORY_FACTS) {
    profile.memory.splice(0, profile.memory.length - MAX_MEMORY_FACTS);
  }
  return saved;
}

/**
 * Turn the AI's JSON (from a chat reply or a voice call summary) into cards,
 * and apply what it decided: facts to remember, a new goal, plan changes.
 */
async function applyResult(profile, plan, result, snapshot, now, label = 'your chat') {
  const widgets = replyWidgets(result, snapshot);
  const actions = [];
  let planChanged = false;

  const remembered = rememberFacts(profile, result.remember, now);
  if (remembered.length) actions.push({ type: 'remembered', summary: remembered.join(' · ').slice(0, 300) });

  const goalUpdate = result.goal_update;
  if (goalUpdate && GOAL_TYPES.includes(goalUpdate.type)) {
    const targetRole = String(goalUpdate.targetRole || '').trim().slice(0, 80);
    const changed = goalUpdate.type !== profile.goal.type || (targetRole && targetRole !== profile.goal.targetRole);
    if (changed) {
      profile.goal.type = goalUpdate.type;
      if (targetRole) profile.goal.targetRole = targetRole;
      const goalLabel = `${goalUpdate.type.replace('_', ' ')}${targetRole ? ` (${targetRole})` : ''}`;
      await rebuildFuture(profile, plan, 'goal_change', `Goal changed to ${goalLabel}. Future milestones were rebuilt around it.`);
      actions.push({ type: 'goal_changed', summary: `Goal is now ${goalLabel}` });
      planChanged = true;
    }
  }

  const changes = applyOps(profile, plan, result.plan_ops, now);
  if (changes.length) {
    widgets.push({ type: 'plan_changes', items: changes.slice(0, 6).map((c) => ({ action: c.action, title: c.title, detail: c.detail || '' })) });
    const summary = `Changed after ${label}: ${changes.map((c) => c.title).slice(0, 3).join('; ')}.`;
    logChange(plan, 'companion', summary, changes, now);
    actions.push({ type: 'plan_changed', summary: summary.slice(0, 300) });
    planChanged = true;
  }
  return { widgets, actions, planChanged, text: textOf(widgets) };
}

// ─── Voice calls (Vapi) ─────────────────────────────────────────────────────

const VOICE_MARK = '__VOICE_CALL__';

/** Everything the companion knows, without the JSON answer format: shared by chat, calls and call summaries. */
function contextFor(profile, snapshot, history, firstName) {
  const full = replyPrompt(profile, snapshot, history, VOICE_MARK, firstName);
  return full.slice(0, full.indexOf(`${firstName} SAYS: ${VOICE_MARK}`)).trim();
}

function answerFormat(profile, snapshot, firstName) {
  const full = replyPrompt(profile, snapshot, [], VOICE_MARK, firstName);
  return full.slice(full.indexOf('Answer as JSON only'));
}

/** System prompt for a live voice call: the student's context plus how to talk. */
async function voiceCallSetup(candidate, profile, plan, firstName) {
  const snapshot = await loadSnapshot(profile, plan);
  const history = (await CompanionMessage.find({ candidate: candidate._id }).sort({ createdAt: -1 }).limit(8).lean()).reverse();
  const systemPrompt = `${contextFor(profile, snapshot, history, firstName)}

YOU ARE NOW ON A LIVE VOICE CALL WITH ${firstName.toUpperCase()}
- Speak naturally, like a friendly senior. Two or three short sentences per turn, then let them talk.
- Never read lists, markdown, ids in square brackets or long numbers. Round numbers and say them simply.
- Use their own data above in every answer. If you do not know something, say so.
- You cannot edit their plan during the call. If they ask for a change, say you will update the plan right after the call.
- End with one clear thing to do this week when the conversation winds down.`;
  const next = snapshot.thisSemester[0] || snapshot.open[0];
  const firstMessage = `Hi ${firstName}! ${next ? `I can see "${next.title}" is next on your plan.` : 'Good to hear from you.'} What would you like to talk about?`;
  return { systemPrompt, firstMessage };
}

/**
 * After a call: summarise it into cards, remember facts and apply plan changes
 * the student asked for, then save it to the chat like any other answer.
 */
async function saveVoiceCall(candidate, profile, plan, transcript, firstName, durationSec = 0) {
  const turns = (Array.isArray(transcript) ? transcript : [])
    .map((t) => ({ role: t.role === 'user' ? 'user' : 'companion', text: String(t.text || '').trim().slice(0, 1000) }))
    .filter((t) => t.text)
    .slice(-60);
  if (!turns.some((t) => t.role === 'user')) return null;

  const snapshot = await loadSnapshot(profile, plan);
  const now = snapshot.now;
  const prompt = `${contextFor(profile, snapshot, [], firstName)}

THE VOICE CALL THAT JUST ENDED (${Math.round(durationSec / 60) || 1} min)
${turns.map((t) => `${t.role === 'user' ? firstName : 'You'}: ${t.text}`).join('\n')}

Summarise the call for ${firstName} as cards. "summary" says what you agreed, "points" are the key takeaways. Apply plan changes only if ${firstName} asked for them on the call.
${answerFormat(profile, snapshot, firstName)}`;

  let widgets;
  let actions = [];
  let planChanged = false;
  let text;
  try {
    const result = await generateJson(prompt, { timeoutMs: 40000 });
    const applied = await applyResult(profile, plan, result, snapshot, now, 'your call');
    ({ widgets, actions, planChanged, text } = applied);
  } catch (err) {
    console.warn('[companion] voice summary failed:', err.message);
    widgets = [{ type: 'headline', title: 'Voice call', text: 'Here is what we said. I could not write a summary just now.' }];
    text = 'Voice call';
  }
  widgets.push({ type: 'transcript', items: turns });

  if (!profile.lastCheckInAt) profile.lastCheckInAt = now;
  await profile.save();
  if (planChanged) await plan.save();

  return CompanionMessage.create({
    candidate: candidate._id,
    clerkId: candidate.clerkId,
    role: 'companion',
    kind: 'voice',
    content: `${text}\n\nCall transcript:\n${turns.map((t) => `${t.role === 'user' ? firstName : 'Companion'}: ${t.text}`).join('\n')}`.slice(0, 6000),
    widgets,
    actions,
  });
}

/**
 * Answer one student message. Saves both messages and applies any plan or
 * memory changes the companion decided on.
 */
async function reply(candidate, profile, plan, text, firstName) {
  const message = String(text || '').trim().slice(0, 2000);
  const snapshot = await loadSnapshot(profile, plan);
  const now = snapshot.now;

  const history = (
    await CompanionMessage.find({ candidate: candidate._id }).sort({ createdAt: -1 }).limit(HISTORY_MESSAGES).lean()
  ).reverse();

  const userMessage = await CompanionMessage.create({
    candidate: candidate._id,
    clerkId: candidate.clerkId,
    role: 'user',
    content: message,
  });

  let replyText;
  let widgets = [];
  const actions = [];
  let planChanged = false;

  try {
    const result = await generateJson(replyPrompt(profile, snapshot, history, message, firstName));
    const applied = await applyResult(profile, plan, result, snapshot, now);
    widgets = applied.widgets;
    replyText = applied.text;
    actions.push(...applied.actions);
    planChanged = applied.planChanged;
    if (!replyText) throw new Error('Empty reply from AI');
  } catch (err) {
    console.warn('[companion] AI reply failed, using plan summary:', err.message);
    replyText = fallbackReply(snapshot);
    widgets = fallbackWidgets(snapshot);
  }

  if (!profile.lastCheckInAt) profile.lastCheckInAt = now;
  await profile.save();
  if (planChanged) await plan.save();

  const companionMessage = await CompanionMessage.create({
    candidate: candidate._id,
    clerkId: candidate.clerkId,
    role: 'companion',
    content: replyText,
    widgets,
    actions,
  });

  return { userMessage, companionMessage, planChanged };
}

module.exports = {
  CHECK_IN_EVERY_DAYS,
  loadSnapshot,
  isCheckInDue,
  composeCheckIn,
  composeWelcome,
  welcomeWidgets,
  checkInWidgets,
  replyWidgets,
  ensureCheckIn,
  rememberFacts,
  fallbackReply,
  reply,
  voiceCallSetup,
  saveVoiceCall,
};
