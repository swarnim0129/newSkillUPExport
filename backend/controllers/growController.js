// Student growth features: what-if, rival ghost, burnout guard, mistake DNA,
// skill passport, Future Self, panic mode, snap & study, squads, interview replay.

const mongoose = require('mongoose');
const StudentProfile = require('../models/StudentProfile');
const JourneyPlan = require('../models/JourneyPlan');
const Passport = require('../models/Passport');
const Sprint = require('../models/Sprint');
const SnapNote = require('../models/SnapNote');
const Squad = require('../models/Squad');
const Interview = require('../models/Interview');
const CompanionMessage = require('../models/CompanionMessage');
const insights = require('../services/insightsService');
const { ensurePassport, buildPassport, validHandle } = require('../services/passportService');
const { futureSelf, futureVoiceSetup, improvedScenario } = require('../services/grow/futureSelf');
const { voiceCallSetup, saveVoiceCall } = require('../services/companionService');
const Candidate = require('../models/Candidate');
const { buildSchedule, topicTips, cleanTopics } = require('../services/grow/sprint');
const { ALLOWED, readNotes } = require('../services/grow/snap');
const squads = require('../services/grow/squads');
const { analyse, betterAnswer } = require('../services/grow/replay');
const { applyOps, logChange } = require('../services/journey/planService');
const { journeyNow } = require('../services/journey/clock');

const clean = (value, max) => String(value || '').trim().slice(0, max);
const firstNameOf = (req) => (req.user && req.user.firstName) || 'there';

async function journeyOf(req) {
  const [profile, plan] = await Promise.all([
    StudentProfile.findOne({ candidate: req.user._id }),
    JourneyPlan.findOne({ candidate: req.user._id }),
  ]);
  return { profile, plan };
}

function needJourney(res) {
  return res.status(404).json({ code: 'no_journey', message: 'Set up your journey first, so this can use your plan and results.' });
}

function fail(res, label, error, message) {
  console.error(`[grow] ${label} error:`, error);
  res.status(500).json({ message });
}

// ─── What-if, rival, wellbeing, DNA ─────────────────────────────────────────

// POST /api/grow/what-if  { hoursPerWeek, goal, dsaPerWeek }
exports.whatIf = async (req, res) => {
  try {
    const { profile, plan } = await journeyOf(req);
    if (!profile || !plan) return needJourney(res);
    res.json({ success: true, result: await insights.whatIf(profile, plan, req.body || {}) });
  } catch (error) { fail(res, 'what-if', error, 'Could not run the simulation'); }
};

// POST /api/grow/what-if/apply  { hoursPerWeek, goal }  (make the scenario real)
exports.applyWhatIf = async (req, res) => {
  try {
    const { profile, plan } = await journeyOf(req);
    if (!profile || !plan) return needJourney(res);
    const hours = Math.round(Number(req.body && req.body.hoursPerWeek));
    if (!Number.isFinite(hours) || hours < 1 || hours > 60) return res.status(400).json({ message: 'Hours must be between 1 and 60' });
    const before = profile.hoursPerWeek;
    profile.hoursPerWeek = hours;
    const now = journeyNow(profile);
    logChange(plan, 'manual', `You committed to ${hours} hours a week (was ${before}) after trying it in the time machine.`, [{ action: 'update', title: 'Weekly hours', detail: `${before} to ${hours}` }], now);
    profile.memory.push({ text: `Committed to ${hours} hours a week on ${now.toDateString()} using the what-if time machine.`, source: 'system', createdAt: now });
    await Promise.all([profile.save(), plan.save()]);
    res.json({ success: true, hoursPerWeek: hours });
  } catch (error) { fail(res, 'what-if apply', error, 'Could not save'); }
};

// GET /api/grow/rival
exports.rival = async (req, res) => {
  try {
    const { profile, plan } = await journeyOf(req);
    if (!profile || !plan) return needJourney(res);
    res.json({ success: true, result: await insights.rival(profile, plan) });
  } catch (error) { fail(res, 'rival', error, 'Could not load the rival ghost'); }
};

// GET /api/grow/wellbeing
exports.wellbeing = async (req, res) => {
  try {
    const { profile, plan } = await journeyOf(req);
    if (!profile || !plan) return needJourney(res);
    res.json({ success: true, result: await insights.wellbeing(profile, plan) });
  } catch (error) { fail(res, 'wellbeing', error, 'Could not load the burnout guard'); }
};

// PUT /api/grow/wellbeing  { optIn, shareWithMentor, tzOffsetMinutes }
exports.wellbeingSettings = async (req, res) => {
  try {
    const { profile, plan } = await journeyOf(req);
    if (!profile || !plan) return needJourney(res);
    const body = req.body || {};
    profile.wellbeing = profile.wellbeing || {};
    if (typeof body.optIn === 'boolean') profile.wellbeing.optIn = body.optIn;
    if (typeof body.shareWithMentor === 'boolean') profile.wellbeing.shareWithMentor = body.shareWithMentor && profile.wellbeing.optIn;
    if (!profile.wellbeing.optIn) profile.wellbeing.shareWithMentor = false;
    const tz = Number(body.tzOffsetMinutes);
    if (Number.isFinite(tz) && tz >= -720 && tz <= 840) profile.wellbeing.tzOffsetMinutes = Math.round(tz);
    await profile.save();
    res.json({ success: true, result: await insights.wellbeing(profile, plan) });
  } catch (error) { fail(res, 'wellbeing settings', error, 'Could not save'); }
};

// POST /api/grow/wellbeing/ease
exports.easePlan = async (req, res) => {
  try {
    const { profile, plan } = await journeyOf(req);
    if (!profile || !plan) return needJourney(res);
    const changes = insights.easePlan(profile, plan);
    profile.wellbeing = profile.wellbeing || {};
    profile.wellbeing.lastEasedAt = new Date();
    await Promise.all([profile.save(), plan.save()]);
    res.json({ success: true, moved: changes.length, result: await insights.wellbeing(profile, plan) });
  } catch (error) { fail(res, 'ease', error, 'Could not ease the plan'); }
};

// GET /api/grow/dna
exports.dna = async (req, res) => {
  try {
    const profile = await StudentProfile.findOne({ candidate: req.user._id });
    const now = profile ? journeyNow(profile) : new Date();
    res.json({ success: true, result: await insights.mistakeDna(req.user._id, now) });
  } catch (error) { fail(res, 'dna', error, 'Could not load your mistake DNA'); }
};

// ─── Skill passport ─────────────────────────────────────────────────────────

function publicSettings(p) {
  return { handle: p.handle, enabled: p.enabled, headline: p.headline, show: p.show, views: p.views };
}

// GET /api/grow/passport
exports.getPassport = async (req, res) => {
  try {
    const passport = await ensurePassport(req.user);
    res.json({ success: true, settings: publicSettings(passport), preview: await buildPassport(passport) });
  } catch (error) { fail(res, 'passport', error, 'Could not load your passport'); }
};

// PUT /api/grow/passport  { enabled, headline, handle, show }
exports.updatePassport = async (req, res) => {
  try {
    const passport = await ensurePassport(req.user);
    const body = req.body || {};
    if (typeof body.enabled === 'boolean') passport.enabled = body.enabled;
    if (body.headline !== undefined) passport.headline = clean(body.headline, 140);
    if (body.handle !== undefined) {
      const handle = String(body.handle).trim().toLowerCase();
      if (!validHandle(handle)) return res.status(400).json({ message: 'Use 3 to 30 lowercase letters, numbers or dashes' });
      if (handle !== passport.handle && (await Passport.exists({ handle }))) return res.status(409).json({ message: 'That link is taken' });
      passport.handle = handle;
    }
    if (body.show && typeof body.show === 'object') {
      ['dsa', 'subjects', 'interviews', 'resume', 'classes', 'journey'].forEach((k) => {
        if (typeof body.show[k] === 'boolean') passport.show[k] = body.show[k];
      });
    }
    await passport.save();
    res.json({ success: true, settings: publicSettings(passport), preview: await buildPassport(passport) });
  } catch (error) { fail(res, 'passport update', error, 'Could not save your passport'); }
};

// GET /api/public/passport/:handle  (no sign-in)
exports.publicPassport = async (req, res) => {
  try {
    const handle = String(req.params.handle || '').toLowerCase();
    if (!validHandle(handle)) return res.status(404).json({ message: 'Passport not found' });
    const passport = await Passport.findOneAndUpdate({ handle, enabled: true }, { $inc: { views: 1 } }, { new: true });
    if (!passport) return res.status(404).json({ message: 'This passport is private or does not exist' });
    res.set('Cache-Control', 'no-store');
    res.json({ success: true, passport: await buildPassport(passport) });
  } catch (error) { fail(res, 'public passport', error, 'Could not load this passport'); }
};

// ─── Future Self ────────────────────────────────────────────────────────────

// POST /api/grow/future-self  { message, history: [{role, text}], path: current|improved }
exports.futureSelf = async (req, res) => {
  try {
    const { profile, plan } = await journeyOf(req);
    if (!profile || !plan) return needJourney(res);
    const message = clean(req.body && req.body.message, 600);
    if (!message) return res.status(400).json({ message: 'Say something to your future self' });
    const history = Array.isArray(req.body.history) ? req.body.history.slice(-8).map((h) => ({ role: h.role === 'user' ? 'user' : 'future', text: clean(h.text, 400) })) : [];
    const path = req.body.path === 'improved' ? 'improved' : 'current';
    const result = await futureSelf({ profile, plan, firstName: firstNameOf(req), message, history, path });
    res.json({ success: true, ...result, improved: improvedScenario(profile) });
  } catch (error) { fail(res, 'future self', error, 'Your future self could not answer just now'); }
};

// ─── Voice calls (Vapi) ─────────────────────────────────────────────────────
// The browser runs the call with Vapi; we supply the system prompt built from
// the student's data, and take the transcript back afterwards.

// GET /api/grow/voice/companion
exports.companionVoice = async (req, res) => {
  try {
    const { profile, plan } = await journeyOf(req);
    if (!profile || !plan) return needJourney(res);
    res.json({ success: true, ...(await voiceCallSetup(req.user, profile, plan, firstNameOf(req))) });
  } catch (error) { fail(res, 'voice setup', error, 'Could not prepare the call'); }
};

// POST /api/grow/voice/companion/session  { transcript: [{role, text}], durationSec }
exports.companionVoiceSession = async (req, res) => {
  try {
    const { profile, plan } = await journeyOf(req);
    if (!profile || !plan) return needJourney(res);
    const message = await saveVoiceCall(req.user, profile, plan, req.body && req.body.transcript, firstNameOf(req), Number(req.body && req.body.durationSec) || 0);
    if (!message) return res.json({ success: true, message: null });
    res.status(201).json({ success: true, message, memory: profile.memory });
  } catch (error) { fail(res, 'voice session', error, 'Could not save the call'); }
};

// GET /api/grow/voice/future?path=current|improved
exports.futureVoice = async (req, res) => {
  try {
    const { profile, plan } = await journeyOf(req);
    if (!profile || !plan) return needJourney(res);
    const path = req.query.path === 'improved' ? 'improved' : 'current';
    res.json({ success: true, ...(await futureVoiceSetup({ profile, plan, firstName: firstNameOf(req), path })) });
  } catch (error) { fail(res, 'future voice', error, 'Could not prepare the call'); }
};

// ─── Panic mode ─────────────────────────────────────────────────────────────

function publicSprint(s) {
  const done = s.blocks.filter((b) => b.done && b.kind !== 'break' && b.kind !== 'sleep').length;
  const total = s.blocks.filter((b) => b.kind !== 'break' && b.kind !== 'sleep').length;
  return {
    id: String(s._id),
    subject: s.subject,
    examAt: s.examAt,
    hoursPerDay: s.hoursPerDay,
    topics: s.topics,
    generatedBy: s.generatedBy,
    active: s.active,
    createdAt: s.createdAt,
    progress: { done, total },
    blocks: s.blocks.map((b) => ({ id: String(b._id), startAt: b.startAt, minutes: b.minutes, kind: b.kind, title: b.title, topic: b.topic, tip: b.tip, done: b.done })),
  };
}

// GET /api/grow/sprints
exports.listSprints = async (req, res) => {
  try {
    const list = await Sprint.find({ candidate: req.user._id }).sort({ createdAt: -1 }).limit(10);
    res.json({ success: true, sprints: list.map(publicSprint) });
  } catch (error) { fail(res, 'sprints', error, 'Could not load your sprints'); }
};

// POST /api/grow/sprints  { subject, examAt, hoursPerDay, topics: [{name, confidence 1-3}], tzOffsetMinutes }
exports.createSprint = async (req, res) => {
  try {
    const body = req.body || {};
    const subject = clean(body.subject, 100);
    if (!subject) return res.status(400).json({ message: 'Name the exam subject' });
    const examAt = new Date(body.examAt);
    const now = new Date();
    if (Number.isNaN(examAt.getTime()) || examAt <= new Date(now.getTime() + 2 * 3600000)) return res.status(400).json({ message: 'The exam must be at least 2 hours away' });
    if (examAt > new Date(now.getTime() + 14 * 86400000)) return res.status(400).json({ message: 'Panic mode is for exams in the next 14 days. Use the exam calendar on your journey for later ones.' });
    const topics = cleanTopics(body.topics);
    if (!topics.length) return res.status(400).json({ message: 'Add at least one topic' });
    const hoursPerDay = Math.max(1, Math.min(14, Math.round(Number(body.hoursPerDay) || 6)));
    const offset = Number.isFinite(Number(body.tzOffsetMinutes)) ? Number(body.tzOffsetMinutes) : 330;

    const { blocks, skipped } = buildSchedule({ now, examAt, hoursPerDay, topics, offset });
    if (!blocks.length) return res.status(400).json({ message: 'There is not enough time before the exam to plan blocks. Rest and do a light review.' });
    const tips = await topicTips(subject, topics);
    if (tips) blocks.forEach((b) => { if (b.topic && tips[b.topic.toLowerCase()]) b.tip = tips[b.topic.toLowerCase()]; });

    await Sprint.updateMany({ candidate: req.user._id, active: true }, { $set: { active: false } });
    const sprint = await Sprint.create({ candidate: req.user._id, subject, examAt, hoursPerDay, topics, blocks, generatedBy: tips ? 'ai' : 'template' });
    res.status(201).json({ success: true, sprint: publicSprint(sprint), skipped });
  } catch (error) { fail(res, 'create sprint', error, 'Could not build your sprint'); }
};

// PATCH /api/grow/sprints/:id/blocks/:blockId  { done }
exports.toggleBlock = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(404).json({ message: 'Sprint not found' });
    const sprint = await Sprint.findOne({ _id: req.params.id, candidate: req.user._id });
    if (!sprint) return res.status(404).json({ message: 'Sprint not found' });
    const block = sprint.blocks.id(req.params.blockId);
    if (!block) return res.status(404).json({ message: 'Block not found' });
    block.done = !!(req.body && req.body.done);
    await sprint.save();
    res.json({ success: true, sprint: publicSprint(sprint) });
  } catch (error) { fail(res, 'block', error, 'Could not update the block'); }
};

// DELETE /api/grow/sprints/:id
exports.deleteSprint = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(404).json({ message: 'Sprint not found' });
    await Sprint.deleteOne({ _id: req.params.id, candidate: req.user._id });
    res.json({ success: true });
  } catch (error) { fail(res, 'delete sprint', error, 'Could not delete the sprint'); }
};

// ─── Snap & study ───────────────────────────────────────────────────────────

function publicSnap(n) {
  return {
    id: String(n._id), title: n.title, subject: n.subject, topics: n.topics, summary: n.summary, formulas: n.formulas,
    questions: n.questions, flashcards: n.flashcards, fileName: n.fileName, addedToPlan: n.addedToPlan, createdAt: n.createdAt,
  };
}

// GET /api/grow/snaps
exports.listSnaps = async (req, res) => {
  try {
    const list = await SnapNote.find({ candidate: req.user._id }).sort({ createdAt: -1 }).limit(30);
    res.json({ success: true, snaps: list.map(publicSnap) });
  } catch (error) { fail(res, 'snaps', error, 'Could not load your snaps'); }
};

// POST /api/grow/snaps  (multipart "file": image or PDF)
exports.createSnap = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'Choose a photo or PDF' });
    if (!ALLOWED.includes(req.file.mimetype)) return res.status(400).json({ message: 'Use a JPG, PNG, WEBP or PDF file' });
    const profile = await StudentProfile.findOne({ candidate: req.user._id }).lean();
    let data;
    try {
      data = await readNotes(req.file, { degree: profile && profile.degree, branch: profile && profile.branch });
    } catch (err) {
      console.warn('[snap] AI failed:', err.message);
      return res.status(503).json({ message: 'Could not read the file just now. Try again in a minute, or with a clearer photo.' });
    }
    if (!data.summary.length && !data.questions.length) {
      return res.status(422).json({ message: `This does not look like study material ("${data.title}"). Try a clearer photo of notes or a page.` });
    }
    const note = await SnapNote.create({ ...data, candidate: req.user._id, fileName: clean(req.file.originalname, 120) });
    res.status(201).json({ success: true, snap: publicSnap(note) });
  } catch (error) { fail(res, 'create snap', error, 'Could not save the notes'); }
};

// POST /api/grow/snaps/:id/plan  (add a revision milestone for these notes)
exports.snapToPlan = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(404).json({ message: 'Not found' });
    const note = await SnapNote.findOne({ _id: req.params.id, candidate: req.user._id });
    if (!note) return res.status(404).json({ message: 'Not found' });
    const { profile, plan } = await journeyOf(req);
    if (!profile || !plan) return needJourney(res);
    const now = journeyNow(profile);
    const changes = applyOps(profile, plan, [{
      op: 'add',
      title: `Revise: ${note.title}`.slice(0, 140),
      description: note.summary.slice(0, 3).join(' ').slice(0, 500),
      category: 'academics',
      tool: 'practice',
      toolTopic: note.subject || note.title,
      priority: 'core',
      dueInDays: 3,
      origin: 'companion',
      reason: 'Added from your Snap & study notes.',
    }], now);
    if (changes.length) logChange(plan, 'manual', `Added a revision of "${note.title}" from Snap & study.`, changes, now);
    note.addedToPlan = true;
    await Promise.all([plan.save(), note.save()]);
    res.json({ success: true, added: changes.length > 0 });
  } catch (error) { fail(res, 'snap plan', error, 'Could not add it to your plan'); }
};

// DELETE /api/grow/snaps/:id
exports.deleteSnap = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(404).json({ message: 'Not found' });
    await SnapNote.deleteOne({ _id: req.params.id, candidate: req.user._id });
    res.json({ success: true });
  } catch (error) { fail(res, 'delete snap', error, 'Could not delete'); }
};

// ─── Squads ─────────────────────────────────────────────────────────────────

// GET /api/grow/squads
exports.listSquads = async (req, res) => {
  try {
    const list = await Squad.find({ members: req.user._id }).sort({ createdAt: -1 });
    res.json({ success: true, squads: await Promise.all(list.map((s) => squads.describeSquad(s, req.user._id))) });
  } catch (error) { fail(res, 'squads', error, 'Could not load your squads'); }
};

// POST /api/grow/squads  { name, focus }
exports.createSquad = async (req, res) => {
  try {
    const name = clean(req.body && req.body.name, 60);
    if (!name) return res.status(400).json({ message: 'Name your squad' });
    if ((await Squad.countDocuments({ members: req.user._id })) >= 3) return res.status(400).json({ message: 'You can be in at most 3 squads' });
    const squad = await squads.createSquad({ name, focus: clean(req.body.focus, 100), members: [req.user._id], createdBy: req.user._id });
    res.status(201).json({ success: true, squad: await squads.describeSquad(squad, req.user._id) });
  } catch (error) { fail(res, 'create squad', error, 'Could not create the squad'); }
};

// POST /api/grow/squads/join  { code }
exports.joinSquad = async (req, res) => {
  try {
    const code = String((req.body && req.body.code) || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    const squad = code ? await Squad.findOne({ code }) : null;
    if (!squad) return res.status(404).json({ message: 'No squad has that code' });
    if (squad.members.some((m) => String(m) === String(req.user._id))) return res.json({ success: true, squad: await squads.describeSquad(squad, req.user._id) });
    if (squad.members.length >= 4) return res.status(400).json({ message: 'That squad is full (4 members)' });
    if ((await Squad.countDocuments({ members: req.user._id })) >= 3) return res.status(400).json({ message: 'You can be in at most 3 squads' });
    squad.members.push(req.user._id);
    await squad.save();
    res.json({ success: true, squad: await squads.describeSquad(squad, req.user._id) });
  } catch (error) { fail(res, 'join squad', error, 'Could not join the squad'); }
};

// DELETE /api/grow/squads/:id/membership
exports.leaveSquad = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(404).json({ message: 'Squad not found' });
    const squad = await Squad.findOne({ _id: req.params.id, members: req.user._id });
    if (!squad) return res.status(404).json({ message: 'Squad not found' });
    squad.members = squad.members.filter((m) => String(m) !== String(req.user._id));
    if (squad.members.length === 0) await squad.deleteOne();
    else await squad.save();
    res.json({ success: true });
  } catch (error) { fail(res, 'leave squad', error, 'Could not leave the squad'); }
};

// POST /api/grow/squads/:id/nudge  { to }  (once a day per pair, through the companion)
exports.nudge = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(404).json({ message: 'Squad not found' });
    const squad = await Squad.findOne({ _id: req.params.id, members: req.user._id });
    if (!squad) return res.status(404).json({ message: 'Squad not found' });
    const to = String((req.body && req.body.to) || '');
    if (!squad.members.some((m) => String(m) === to) || to === String(req.user._id)) return res.status(400).json({ message: 'Pick a squadmate' });
    const today = squads.dayKey(new Date());
    if (squad.lastNudges.some((n) => String(n.from) === String(req.user._id) && String(n.to) === to && squads.dayKey(n.at) === today)) {
      return res.status(429).json({ message: 'You already nudged them today' });
    }
    const target = await Candidate.findById(to).select('clerkId').lean();
    if (target) {
      await CompanionMessage.create({
        candidate: to,
        clerkId: target.clerkId,
        role: 'companion',
        kind: 'mentor',
        content: `${squads.displayName(req.user)} from your squad "${squad.name}" nudged you: the squad streak needs you today. One problem or one Lab set keeps the flame alive.`,
        widgets: [
          { type: 'headline', title: `${squads.displayName(req.user)} nudged you`, text: `Your squad "${squad.name}" needs you today to keep the shared streak.` },
          { type: 'next', title: 'Keep the flame', text: 'Solve one problem or take one Lab set', tool: 'dsa', toolTopic: '' },
        ],
      });
    }
    squad.lastNudges.push({ from: req.user._id, to, at: new Date() });
    if (squad.lastNudges.length > 50) squad.lastNudges.splice(0, squad.lastNudges.length - 50);
    await squad.save();
    res.json({ success: true });
  } catch (error) { fail(res, 'nudge', error, 'Could not send the nudge'); }
};

// ─── Interview replay ───────────────────────────────────────────────────────

async function myInterview(req) {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) return null;
  return Interview.findOne({ _id: req.params.id, clerkId: req.clerkId });
}

// GET /api/grow/interviews  (list for the replay picker)
exports.listInterviews = async (req, res) => {
  try {
    const list = await Interview.find({ clerkId: req.clerkId, 'transcript.1': { $exists: true } })
      .sort({ createdAt: -1 }).limit(20).select('role seniority category topic createdAt feedback status').lean();
    res.json({
      success: true,
      interviews: list.map((i) => ({
        id: String(i._id), role: i.role, seniority: i.seniority, category: i.category, topic: i.topic, createdAt: i.createdAt,
        score: i.feedback && typeof i.feedback.technical_score === 'number' ? Math.round(((i.feedback.technical_score + (i.feedback.communication_score || 0)) / 2) * 10) : null,
      })),
    });
  } catch (error) { fail(res, 'replay list', error, 'Could not load your interviews'); }
};

// GET /api/grow/interviews/:id/replay
exports.replay = async (req, res) => {
  try {
    const interview = await myInterview(req);
    if (!interview) return res.status(404).json({ message: 'Interview not found' });
    const { turns, summary } = analyse(interview);
    res.json({
      success: true,
      interview: { id: String(interview._id), role: interview.role, seniority: interview.seniority, category: interview.category, topic: interview.topic, createdAt: interview.createdAt, feedback: interview.feedback || null },
      turns,
      summary,
    });
  } catch (error) { fail(res, 'replay', error, 'Could not build the replay'); }
};

// POST /api/grow/interviews/:id/replay/:turn/better
exports.betterAnswer = async (req, res) => {
  try {
    const interview = await myInterview(req);
    if (!interview) return res.status(404).json({ message: 'Interview not found' });
    const { turns } = analyse(interview);
    const turn = turns[Number(req.params.turn)];
    if (!turn) return res.status(404).json({ message: 'Answer not found' });
    try {
      res.json({ success: true, better: await betterAnswer(interview, turn) });
    } catch (err) {
      console.warn('[replay] AI failed:', err.message);
      res.status(503).json({ message: 'Could not write a better answer just now. Try again in a minute.' });
    }
  } catch (error) { fail(res, 'better answer', error, 'Could not write a better answer'); }
};

// POST /api/grow/interviews/:id/replay/practice  (add a focused retake to the plan)
exports.replayToPlan = async (req, res) => {
  try {
    const interview = await myInterview(req);
    if (!interview) return res.status(404).json({ message: 'Interview not found' });
    const { profile, plan } = await journeyOf(req);
    if (!profile || !plan) return needJourney(res);
    const { summary } = analyse(interview);
    const now = journeyNow(profile);
    const weak = summary.weakest;
    const changes = applyOps(profile, plan, [{
      op: 'add',
      title: `Retake: ${interview.role} interview, fix ${weak ? weak.reasons[0].toLowerCase() : 'weak answers'}`.slice(0, 140),
      description: weak ? `Weakest answer was to: "${String(weak.question).slice(0, 200)}"` : '',
      category: 'career',
      tool: 'mock_interview',
      toolTopic: interview.role,
      priority: 'core',
      dueInDays: 7,
      origin: 'remedial',
      reason: 'Added from your interview replay.',
    }], now);
    if (changes.length) logChange(plan, 'evidence', 'Interview replay added a focused retake.', changes, now);
    await plan.save();
    res.json({ success: true, added: changes.length > 0 });
  } catch (error) { fail(res, 'replay plan', error, 'Could not add it to your plan'); }
};
