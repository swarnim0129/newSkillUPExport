// Snap & study: read a photo or PDF of notes, a whiteboard or a syllabus with
// Gemini's vision, and turn it into a summary, a quiz and flashcards.

const { generateJson } = require('../aiJson');

const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'];

function str(v, max) {
  return String(v || '').replace(/\*\*|`/g, '').trim().slice(0, max);
}

function normalizeQuestion(q) {
  const options = (Array.isArray(q && q.options) ? q.options : []).map((o) => str(o, 200)).filter(Boolean).slice(0, 4);
  const answerIndex = Number(q && q.answerIndex);
  if (!str(q && q.prompt, 400) || options.length < 2 || !Number.isInteger(answerIndex) || answerIndex < 0 || answerIndex >= options.length) return null;
  return { prompt: str(q.prompt, 400), options, answerIndex, explanation: str(q.explanation, 300) };
}

async function readNotes(file, context = {}) {
  const prompt = `This is a photo or PDF a student took of class notes, a whiteboard, a textbook page or a slide.
Student: ${context.degree || 'B.Tech'} in ${context.branch || 'engineering'}.
Read it carefully. If parts are unreadable, work with what is clear. If it is not study material, say so in "title" and leave the lists empty.
Write maths as plain text (x^2, sqrt(x), a/b), never LaTeX.
Return JSON only:
{"title": "what this page is about, at most 8 words",
 "subject": "the subject it belongs to, e.g. Thermodynamics",
 "topics": ["2-6 topics covered"],
 "summary": ["4-7 key points, each at most 25 words"],
 "formulas": ["0-6 formulas or definitions exactly as needed for an exam"],
 "questions": [{"prompt": "...", "options": ["...", "...", "...", "..."], "answerIndex": 0, "explanation": "1 sentence"}],
 "flashcards": [{"front": "question or term", "back": "answer, at most 25 words"}]}
Write exactly 5 questions and 6 to 10 flashcards, all from this material.`;

  const result = await generateJson([
    { text: prompt },
    { inlineData: { data: file.buffer.toString('base64'), mimeType: file.mimetype } },
  ], { timeoutMs: 60000, temperature: 0.4 });

  return {
    title: str(result.title, 140) || 'Untitled notes',
    subject: str(result.subject, 100),
    topics: (Array.isArray(result.topics) ? result.topics : []).map((t) => str(t, 100)).filter(Boolean).slice(0, 8),
    summary: (Array.isArray(result.summary) ? result.summary : []).map((t) => str(t, 300)).filter(Boolean).slice(0, 8),
    formulas: (Array.isArray(result.formulas) ? result.formulas : []).map((t) => str(t, 200)).filter(Boolean).slice(0, 8),
    questions: (Array.isArray(result.questions) ? result.questions : []).map(normalizeQuestion).filter(Boolean).slice(0, 6),
    flashcards: (Array.isArray(result.flashcards) ? result.flashcards : [])
      .map((c) => ({ front: str(c && c.front, 200), back: str(c && c.back, 300) }))
      .filter((c) => c.front && c.back)
      .slice(0, 12),
  };
}

/** For mentors: turn a syllabus into a week-by-week list of classwork to review. */
async function readSyllabus(file, context = {}) {
  const prompt = `This is a course syllabus, timetable or topic list a faculty member uploaded for their class "${context.className || ''}".
Turn it into a week-by-week practice plan for students. Use at most ${context.weeks || 12} weeks.
For each week give one practice item: the subject name as it should appear (short), and the topics of that week.
Return JSON only: {"course": "course name", "weeks": [{"week": 1, "title": "short title, at most 8 words", "subject": "subject name", "topics": ["..."]}]}`;
  const result = await generateJson([
    { text: prompt },
    { inlineData: { data: file.buffer.toString('base64'), mimeType: file.mimetype } },
  ], { timeoutMs: 60000, temperature: 0.3 });
  return {
    course: str(result.course, 100),
    weeks: (Array.isArray(result.weeks) ? result.weeks : [])
      .map((w, i) => ({
        week: Number.isInteger(Number(w && w.week)) ? Number(w.week) : i + 1,
        title: str(w && w.title, 120),
        subject: str(w && w.subject, 100),
        topics: (Array.isArray(w && w.topics) ? w.topics : []).map((t) => str(t, 100)).filter(Boolean).slice(0, 6),
      }))
      .filter((w) => w.title && w.subject)
      .slice(0, 20),
  };
}

module.exports = { ALLOWED, readNotes, readSyllabus };
