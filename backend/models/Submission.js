const mongoose = require('mongoose');

// One row per (assignment, student). Created when the student first sees or
// works on the assignment, and kept up to date by the auto-checks.
const submissionSchema = new mongoose.Schema(
  {
    assignment: { type: mongoose.Schema.Types.ObjectId, ref: 'Assignment', required: true },
    classroom: { type: mongoose.Schema.Types.ObjectId, ref: 'Classroom', required: true, index: true },
    candidate: { type: mongoose.Schema.Types.ObjectId, ref: 'Candidate', required: true, index: true },
    // Plan milestone this assignment became in the student's journey
    milestoneId: { type: mongoose.Schema.Types.ObjectId, default: null },
    progress: { type: Number, default: 0, min: 0, max: 1 },
    progressLabel: { type: String, default: '' },
    completedAt: { type: Date, default: null },
    // task: what the student handed in
    text: { type: String, default: '', maxlength: 4000 },
    link: { type: String, default: '', maxlength: 500 },
    turnedInAt: { type: Date, default: null },
    // quiz: chosen option per question, and the result
    answers: [Number],
    score: { type: Number, default: null },
    // Mentor's mark and comment; auto-graded types fill grade themselves
    grade: { type: Number, default: null },
    feedback: { type: String, default: '', maxlength: 2000 },
    returnedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

submissionSchema.index({ assignment: 1, candidate: 1 }, { unique: true });

module.exports = mongoose.model('Submission', submissionSchema);
