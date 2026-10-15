const mongoose = require('mongoose');

// A generated set of subject questions. Answers stay on the server; the
// browser only receives questions and options until the set is submitted.
const questionSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['mcq', 'numeric'], required: true },
    question: { type: String, required: true },
    options: [String],
    answerIndex: { type: Number, default: null },
    answer: { type: Number, default: null },
    tolerancePct: { type: Number, default: 2 },
    unit: { type: String, default: '' },
    explanation: { type: String, default: '' },
    concept: { type: String, default: '' },
  },
  { _id: false }
);

const labSetSchema = new mongoose.Schema(
  {
    candidate: { type: mongoose.Schema.Types.ObjectId, ref: 'Candidate', required: true, index: true },
    clerkId: { type: String, required: true },
    subject: { type: String, required: true },
    difficulty: { type: String, enum: ['easy', 'medium', 'hard'], default: 'medium' },
    isReview: { type: Boolean, default: false },
    questions: [questionSchema],
    submitted: { type: Boolean, default: false },
    answers: [mongoose.Schema.Types.Mixed],
    score: { type: Number, default: null },
    submittedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('LabSet', labSetSchema);
