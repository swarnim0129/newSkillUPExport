// Future Self: the student talks to themselves in final year. Two versions:
// the one who kept today's habits, and the one who made the change. Both speak
// only from the student's own projection, so the "future" is grounded in data.

const { generateJson } = require('../aiJson');
const { whatIf } = require('../insightsService');
const { journeyNow, semesterStart } = require('../journey/clock');
const { isOpen, formatDate } = require('../journey/planService');

const clean = (value, max) => String(value || '').replace(/\*\*|__|`|#+\s/g, '').trim().slice(0, max);

function improvedScenario(profile) {
  const hours = Math.min(60, (profile.hoursPerWeek || 8) + 4);
  return { hoursPerWeek: hours, dsaPerWeek: 5, goal: (profile.goal && profile.goal.type) || 'undecided' };
}

/** Who the future self is, and what happened to them, from the student's own projection. */
async function persona({ profile, plan, firstName, path }) {
  const now = journeyNow(profile);
  const improved = improvedScenario(profile);
  const projection = await whatIf(profile, plan, path === 'improved' ? improved : { hoursPerWeek: profile.hoursPerWeek, goal: profile.goal && profile.goal.type, dsaPerWeek: 0 });
  const other = path === 'improved' ? null : await whatIf(profile, plan, improved);
  const finalYear = semesterStart(profile, 8);
  const readyDate = path === 'improved' ? projection.readyDate.scenario : projection.readyDate.baseline;
  const atTarget = path === 'improved' ? projection.atTarget.scenario : projection.atTarget.baseline;
  const open = plan.milestones.filter(isOpen).sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt)).slice(0, 5);
  const memory = (profile.memory || []).slice(-8).map((m) => `- ${m.text}`).join('\n') || '- nothing yet';

  const text = `You are ${firstName}, an engineering student, speaking from the future: it is ${formatDate(finalYear)}, final year of ${profile.degree} in ${profile.branch}. You are talking to your younger self, who is in today's ${formatDate(now)}.

WHICH FUTURE YOU ARE
${path === 'improved'
    ? `You are the version who changed habits: ${improved.hoursPerWeek} hours a week (up from ${profile.hoursPerWeek}) and ${improved.dsaPerWeek} DSA problems a week.`
    : `You are the version who kept exactly today's habits: ${profile.hoursPerWeek} hours a week.`}

WHAT ACTUALLY HAPPENED TO YOU (from the projection, do not invent other numbers)
- Readiness when it mattered (${projection.target.label}): ${atTarget}/100 (the ready level is ${projection.readyLevel}).
- ${readyDate ? `You reached the ready level around ${formatDate(readyDate)}.` : 'You did not reach the ready level in time.'}
- Goal: ${(profile.goal && profile.goal.type) || 'undecided'}${profile.goal && profile.goal.targetRole ? `, ${profile.goal.targetRole}` : ''}.
- The other version of you ${path === 'improved' ? `(who kept old habits) reached ${projection.atTarget.baseline}/100.` : `(who added ${improved.hoursPerWeek - profile.hoursPerWeek} hours and ${improved.dsaPerWeek} DSA problems a week) reached ${other.atTarget.scenario}/100.`}

THINGS YOUR YOUNGER SELF IS FACING NOW
${open.map((m) => `- ${m.title} (due ${formatDate(m.dueAt)})`).join('\n') || '- nothing open'}
WHAT YOU REMEMBER ABOUT YOURSELF
${memory}`;
  return { text, projection, atTarget, readyDate, improved, open };
}

/** System prompt and greeting for a live Future Self voice call. */
async function futureVoiceSetup({ profile, plan, firstName, path = 'current' }) {
  const p = await persona({ profile, plan, firstName, path });
  const systemPrompt = `${p.text}

YOU ARE ON A LIVE VOICE CALL WITH YOUR YOUNGER SELF
- Speak in first person, warm and honest, like a real person, not a coach. Two or three short sentences per turn.
- Mention specific choices made around now. Never claim jobs, companies, ranks or numbers that are not above.
- Do not read lists or long numbers; round them and say them simply.`;
  const firstMessage = path === 'improved'
    ? `Hey ${firstName}. It's you, from final year. We made the change, and I'm glad we did. Ask me anything.`
    : `Hey ${firstName}. It's you, from final year. I kept doing things the way you are now. Ask me how that went.`;
  return { systemPrompt, firstMessage, projection: { baseline: p.projection.atTarget.baseline, scenario: p.projection.atTarget.scenario, target: p.projection.target.label }, improved: p.improved };
}

async function futureSelf({ profile, plan, firstName, message, history = [], path = 'current' }) {
  const p = await persona({ profile, plan, firstName, path });
  const { projection, atTarget, readyDate, improved, open } = p;

  const prompt = `${p.text}

CONVERSATION SO FAR
${history.slice(-6).map((h) => `${h.role === 'user' ? 'Younger you' : 'Future you'}: ${clean(h.text, 300)}`).join('\n') || '(first message)'}

YOUNGER YOU SAYS: ${clean(message, 600)}

Speak in first person, warm and honest, like a real person, not a coach. Mention one specific memory of a choice made around now. Never claim jobs, companies, ranks or numbers that are not above.
Return JSON only, plain text, no markdown:
{"speech": "what you say out loud, 2-4 sentences, at most 70 words", "title": "at most 7 words", "points": ["0-3 short lessons, at most 16 words each"], "advice": "one thing to do this week, at most 16 words"}`;

  let result;
  try {
    result = await generateJson(prompt, { temperature: 0.8 });
  } catch (err) {
    console.warn('[future-self] AI failed:', err.message);
    result = {
      speech: readyDate
        ? `I made it to ${atTarget} by ${projection.target.label}. It came from small weeks, not big ones. Do not skip this week.`
        : `I got to ${atTarget} by ${projection.target.label}, short of ${projection.readyLevel}. I wish I had started the extra hours earlier.`,
      title: path === 'improved' ? 'The version who changed' : 'The version who stayed the same',
      points: [],
      advice: open[0] ? `Finish "${open[0].title}" this week.` : 'Add one focused hour this week.',
    };
  }

  const widgets = [
    { type: 'headline', title: clean(result.title, 80) || 'From your future self', text: clean(result.speech, 600) },
    {
      type: 'stats',
      items: [
        { label: 'Readiness then', value: `${atTarget}`, hint: projection.target.label },
        { label: 'Ready by', value: readyDate ? new Date(readyDate).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }) : 'Not in time', hint: `Level ${projection.readyLevel}` },
        { label: 'Hours a week', value: `${path === 'improved' ? improved.hoursPerWeek : profile.hoursPerWeek}`, hint: path === 'improved' ? `+${improved.dsaPerWeek} DSA a week` : 'Same as now' },
      ],
    },
  ];
  const points = (Array.isArray(result.points) ? result.points : []).map((p) => clean(p, 160)).filter(Boolean).slice(0, 3);
  if (points.length) widgets.push({ type: 'points', title: 'What I learned', style: 'bullets', items: points });
  if (clean(result.advice, 160)) {
    widgets.push({ type: 'next', title: 'Do this week', text: clean(result.advice, 160), tool: open[0] ? open[0].tool : 'none', toolTopic: open[0] ? open[0].toolTopic || '' : '' });
  }

  return {
    speech: clean(result.speech, 600),
    widgets,
    path,
    projection: { baseline: projection.atTarget.baseline, scenario: projection.atTarget.scenario, target: projection.target.label },
  };
}

module.exports = { futureSelf, futureVoiceSetup, improvedScenario };
