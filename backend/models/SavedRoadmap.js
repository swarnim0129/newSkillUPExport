const mongoose = require('mongoose');

const roadmapResourceSchema = new mongoose.Schema(
  {
    title: String,
    url: String,
    platform: String,
    thumbnail: String,
    duration: String,
    is_free: Boolean,
    rating: Number,
    instructor: String,
  },
  { _id: false }
);

const roadmapNodeSchema = new mongoose.Schema(
  {
    topic: String,
    resources: [roadmapResourceSchema],
    fetched_at: String,
    status: {
      type: String,
      enum: ['not_started', 'in_progress', 'completed'],
      default: 'not_started',
    },
    completedAt: { type: Date, default: null },
    timeSpentMinutes: { type: Number, default: 0 },
    xpAwarded: { type: Number, default: 0 },
    // Set on review nodes added after a failed quiz: the chapter that caused it
    triggeredBy: { type: String, default: null },
  },
  { _id: false }
);

const savedRoadmapSchema = new mongoose.Schema({
  clerkId: {
    type: String,
    index: true,
  },
  candidate: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Candidate',
    index: true,
  },
  userId: {
    type: String,
    index: true,
  },
  topic: {
    type: String,
    required: true,
  },
  mermaidCode: {
    type: String,
    required: true,
  },
  topicCluster: {
    type: String,
    default: 'misc',
    index: true,
  },
  nodes: [roadmapNodeSchema],
  progressPercent: {
    type: Number,
    default: 0,
    min: 0,
    max: 100,
  },
  completedNodesCount: {
    type: Number,
    default: 0,
    min: 0,
  },
  totalNodesCount: {
    type: Number,
    default: 0,
    min: 0,
  },
  completedAt: {
    type: Date,
    default: null,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

savedRoadmapSchema.index({ userId: 1, createdAt: -1 });
savedRoadmapSchema.index({ clerkId: 1, createdAt: -1 });
savedRoadmapSchema.index({ candidate: 1, createdAt: -1 });
savedRoadmapSchema.index({ topicCluster: 1, createdAt: -1 });

module.exports = mongoose.model('SavedRoadmap', savedRoadmapSchema);