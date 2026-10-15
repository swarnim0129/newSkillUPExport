const mongoose = require('mongoose');

// What a mentor can set. All but `quiz` and `task` are checked automatically
// from the student's own practice, interview and resume results.
const TYPES = ['dsa_problems', 'dsa_pattern', 'lab_subject', 'mock_interview', 'resume', 'quiz', 'task'];

const questionSchema = new mongoose.Schema(
  {
    prompt: { type: String, required: true, maxlength: 600 },
    options: { type: [String], validate: (v) => Array.isArray(v) && v.length >= 2 && v.length <= 6 },
    answerIndex: { type: Number, required: true, min: 0 },
    explanation: { type: String, default: '', maxlength: 600 },
  },
  { _id: false }
);

const assignmentSchema = new mongoose.Schema(
  {
    classroom: { type: mongoose.Schema.Types.ObjectId, ref: 'Classroom', required: true, index: true },
    mentor: { type: mongoose.Schema.Types.ObjectId, ref: 'Mentor', required: true },
    type: { type: String, enum: TYPES, required: true },
    title: { type: String, required: true, maxlength: 120 },
    instructions: { type: String, default: '', maxlength: 2000 },
    // dsa_problems: slugs; dsa_pattern: pattern + level; lab_subject: subject + minScore;
    // mock_interview: role + minScore; resume: minScore
    target: {
      slugs: [String],
      pattern: { type: String, default: '' },
      level: { type: Number, default: 0, min: 0, max: 100 },
      subject: { type: String, default: '' },
      role: { type: String, default: '' },
      minScore: { type: Number, default: 0, min: 0, max: 100 },
    },
    questions: [questionSchema],
    points: { type: Number, default: 100, min: 0, max: 1000 },
    dueAt: { type: Date, default: null },
    // Last time the mentor sent reminders, to stop repeated nudges
    lastNudgedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

assignmentSchema.statics.TYPES = TYPES;

module.exports = mongoose.model('Assignment', assignmentSchema);
