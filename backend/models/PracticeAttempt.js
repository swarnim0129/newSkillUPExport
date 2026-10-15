const mongoose = require('mongoose');

const MISTAKE_TYPES = [
  'syntax_error',
  'runtime_error',
  'too_slow',
  'edge_case',
  'off_by_one',
  'wrong_approach',
  'logic_error',
  'concept_gap',
  'calculation_error',
];

// Every submission, kept as the student's mistake journal
const practiceAttemptSchema = new mongoose.Schema(
  {
    candidate: { type: mongoose.Schema.Types.ObjectId, ref: 'Candidate', required: true },
    clerkId: { type: String, required: true },
    kind: { type: String, enum: ['dsa', 'lab'], required: true },
    // DSA: problem slug and pattern key. Lab: set id and subject.
    ref: { type: String, required: true },
    topic: { type: String, required: true },
    title: { type: String, default: '' },

    passed: { type: Boolean, required: true },
    passedCount: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
    timeSpentSec: { type: Number, default: 0 },
    hintLevel: { type: Number, default: 0 },
    isReview: { type: Boolean, default: false },
    credit: { type: Number, default: 0 },

    mistake: {
      type: { type: String, enum: MISTAKE_TYPES },
      explanation: { type: String, default: '' },
      fixHint: { type: String, default: '' },
      source: { type: String, enum: ['rule', 'ai'], default: 'rule' },
    },
    // A plan milestone was added because this mistake kept repeating
    drillAdded: { type: Boolean, default: false },

    code: { type: String, default: '', maxlength: 20000 },
    failure: { type: mongoose.Schema.Types.Mixed, default: null },
    occurredAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

practiceAttemptSchema.index({ candidate: 1, occurredAt: -1 });
practiceAttemptSchema.index({ candidate: 1, kind: 1, passed: 1, occurredAt: -1 });

practiceAttemptSchema.statics.MISTAKE_TYPES = MISTAKE_TYPES;

module.exports = mongoose.model('PracticeAttempt', practiceAttemptSchema);
