const mongoose = require('mongoose');

const badgeUnlockSchema = new mongoose.Schema(
  {
    code: { type: String, required: true },
    name: { type: String, required: true },
  },
  { _id: false }
);

const gamificationEventSchema = new mongoose.Schema(
  {
    candidate: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Candidate',
      required: true,
      index: true,
    },
    clerkId: {
      type: String,
      required: true,
      index: true,
    },
    eventType: {
      type: String,
      required: true,
      enum: [
        'roadmap_saved',
        'roadmap_node_completed',
        'roadmap_completed',
        'roadmap_adapted',
        'tutor_chapter_completed',
        'quiz_completed',
        'resume_analyzed',
        'resume_generated',
        'resume_exported',
        'interview_completed',
        'application_sent',
        'dsa_solved',
      ],
    },
    source: {
      type: String,
      required: true,
      enum: ['roadmap', 'tutor', 'resume', 'interview', 'application', 'system', 'feedback_loop', 'practice'],
    },
    sourceRef: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    topic: {
      type: String,
      default: null,
    },
    topicCluster: {
      type: String,
      default: 'misc',
      index: true,
    },
    occurredAt: {
      type: Date,
      required: true,
      default: Date.now,
      index: true,
    },
    xpBase: {
      type: Number,
      default: 0,
      min: 0,
    },
    xpMultiplier: {
      type: Number,
      default: 1,
      min: 0,
    },
    xpAwarded: {
      type: Number,
      default: 0,
      min: 0,
    },
    creditsAwarded: {
      type: Number,
      default: 0,
    },
    streakBefore: {
      type: Number,
      default: 0,
      min: 0,
    },
    streakAfter: {
      type: Number,
      default: 0,
      min: 0,
    },
    levelBefore: {
      type: Number,
      default: 1,
      min: 1,
    },
    levelAfter: {
      type: Number,
      default: 1,
      min: 1,
    },
    badgesUnlocked: {
      type: [badgeUnlockSchema],
      default: [],
    },
    dedupeKey: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true }
);

gamificationEventSchema.index({ candidate: 1, occurredAt: -1 });
gamificationEventSchema.index({ topicCluster: 1, occurredAt: -1 });
gamificationEventSchema.index({ eventType: 1, occurredAt: -1 });

module.exports = mongoose.model('GamificationEvent', gamificationEventSchema);
