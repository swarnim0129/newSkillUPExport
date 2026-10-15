const mongoose = require('mongoose');

// One row per thing the student actually did. The profile's skill levels and the
// plan's adjustments are both derived from these rows.
const studentEventSchema = new mongoose.Schema(
  {
    candidate: { type: mongoose.Schema.Types.ObjectId, ref: 'Candidate', required: true, index: true },
    clerkId: { type: String, required: true },
    type: {
      type: String,
      required: true,
      enum: [
        'quiz_completed',
        'tutor_chapter_completed',
        'roadmap_node_completed',
        'roadmap_completed',
        'interview_completed',
        'resume_analyzed',
        'resume_generated',
        'application_sent',
        'milestone_done',
        'dsa_solved',
      ],
    },
    topic: { type: String, default: '' },
    // 0-100, or null when the event has no measurable result
    score: { type: Number, default: null, min: 0, max: 100 },
    // Id of the thing this event is about; one event per (type, refId)
    refId: { type: String, default: null },
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
    occurredAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

studentEventSchema.index({ candidate: 1, occurredAt: -1 });
studentEventSchema.index(
  { candidate: 1, type: 1, refId: 1 },
  { unique: true, partialFilterExpression: { refId: { $type: 'string' } } }
);

module.exports = mongoose.model('StudentEvent', studentEventSchema);
