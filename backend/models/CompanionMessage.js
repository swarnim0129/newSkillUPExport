const mongoose = require('mongoose');

const actionSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['plan_changed', 'remembered', 'goal_changed'], required: true },
    summary: { type: String, required: true, maxlength: 300 },
  },
  { _id: false }
);

const companionMessageSchema = new mongoose.Schema(
  {
    candidate: { type: mongoose.Schema.Types.ObjectId, ref: 'Candidate', required: true, index: true },
    clerkId: { type: String, required: true },
    role: { type: String, enum: ['user', 'companion'], required: true },
    // 'checkin' messages are started by the companion, not by the student
    kind: { type: String, enum: ['chat', 'checkin', 'welcome', 'mentor', 'voice'], default: 'chat' },
    // Plain text: what the companion said, also used as chat history for the AI
    content: { type: String, required: true, maxlength: 6000 },
    // Structured cards the chat renders instead of one long paragraph
    // (headline, points, stats, milestones, alert, next, plan_changes)
    widgets: { type: [mongoose.Schema.Types.Mixed], default: [] },
    actions: [actionSchema],
  },
  { timestamps: true }
);

companionMessageSchema.index({ candidate: 1, createdAt: -1 });

module.exports = mongoose.model('CompanionMessage', companionMessageSchema);
