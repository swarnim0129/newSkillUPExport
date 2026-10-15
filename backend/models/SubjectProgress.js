const mongoose = require('mongoose');

// Practice Lab history per subject: review schedule and concepts recently missed
const subjectProgressSchema = new mongoose.Schema(
  {
    candidate: { type: mongoose.Schema.Types.ObjectId, ref: 'Candidate', required: true },
    clerkId: { type: String, required: true },
    subject: { type: String, required: true },
    sets: { type: Number, default: 0 },
    lastScore: { type: Number, default: null },
    bestScore: { type: Number, default: null },
    reviewStage: { type: Number, default: 0, min: 0, max: 3 },
    nextReviewAt: { type: Date, default: null },
    // Concepts answered wrongly, newest first; the next set targets them
    missedConcepts: [String],
    lastPracticedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

subjectProgressSchema.index({ candidate: 1, subject: 1 }, { unique: true });

module.exports = mongoose.model('SubjectProgress', subjectProgressSchema);
