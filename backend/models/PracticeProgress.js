const mongoose = require('mongoose');

// One row per student per DSA problem: how well it is known and when it
// should be solved again (spaced repetition).
const practiceProgressSchema = new mongoose.Schema(
  {
    candidate: { type: mongoose.Schema.Types.ObjectId, ref: 'Candidate', required: true },
    clerkId: { type: String, required: true },
    slug: { type: String, required: true },
    pattern: { type: String, required: true },

    attempts: { type: Number, default: 0 },
    // Failed attempts since the last success; lowers the credit of the next success
    failedSinceSuccess: { type: Number, default: 0 },
    solved: { type: Boolean, default: false },
    firstSolvedAt: { type: Date, default: null },
    lastSolvedAt: { type: Date, default: null },
    lastAttemptAt: { type: Date, default: null },

    // 0-1: how cleanly it was last solved (hints and failed tries lower it)
    credit: { type: Number, default: 0, min: 0, max: 1 },
    // Review schedule: stage 0-3 maps to 3, 7, 21 and 60 days
    reviewStage: { type: Number, default: 0, min: 0, max: 3 },
    nextReviewAt: { type: Date, default: null },

    // Hints opened since the last success. They stay visible, and lower the
    // credit of the next success; solving clears them.
    hintLevelOpen: { type: Number, default: 0, min: 0, max: 3 },
    openedHints: [String],
  },
  { timestamps: true }
);

practiceProgressSchema.index({ candidate: 1, slug: 1 }, { unique: true });
practiceProgressSchema.index({ candidate: 1, pattern: 1 });

module.exports = mongoose.model('PracticeProgress', practiceProgressSchema);
