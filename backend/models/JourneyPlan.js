const mongoose = require('mongoose');

const TOOLS = ['roadmap', 'tutor', 'flashcards', 'resume_analyzer', 'resume_builder', 'mock_interview', 'dsa', 'practice', 'classwork', 'companion', 'none'];
const CATEGORIES = ['academics', 'skills', 'projects', 'career', 'placement', 'habits'];

const milestoneSchema = new mongoose.Schema({
  title: { type: String, required: true, maxlength: 140 },
  description: { type: String, default: '', maxlength: 500 },
  semester: { type: Number, required: true, min: 1, max: 8 },
  category: { type: String, enum: CATEGORIES, default: 'skills' },
  // Which platform tool the student uses to do this, and what to open it with
  tool: { type: String, enum: TOOLS, default: 'none' },
  toolTopic: { type: String, default: '' },
  priority: { type: String, enum: ['core', 'stretch'], default: 'core' },
  dueAt: { type: Date, required: true },
  status: { type: String, enum: ['pending', 'in_progress', 'done', 'skipped'], default: 'pending' },
  completedAt: { type: Date, default: null },
  // Why this milestone exists: the original plan, or a later adjustment
  origin: { type: String, enum: ['plan', 'remedial', 'companion', 'replan', 'mentor'], default: 'plan' },
  reason: { type: String, default: '', maxlength: 300 },
  slipCount: { type: Number, default: 0 },
});

const changeSchema = new mongoose.Schema(
  {
    action: { type: String, enum: ['add', 'remove', 'move', 'update', 'complete', 'skip', 'mode'], required: true },
    title: { type: String, required: true },
    detail: { type: String, default: '' },
  },
  { _id: false }
);

const changeLogSchema = new mongoose.Schema(
  {
    at: { type: Date, default: Date.now },
    trigger: {
      type: String,
      enum: ['setup', 'evidence', 'overdue', 'goal_change', 'new_year', 'companion', 'manual', 'exam', 'mistake', 'mentor'],
      required: true,
    },
    summary: { type: String, required: true, maxlength: 400 },
    changes: [changeSchema],
  },
  { _id: false }
);

const journeyPlanSchema = new mongoose.Schema(
  {
    candidate: { type: mongoose.Schema.Types.ObjectId, ref: 'Candidate', required: true, unique: true },
    clerkId: { type: String, required: true, index: true },
    generatedBy: { type: String, enum: ['ai', 'template'], default: 'template' },
    // Last year the plan was reviewed in, used to detect "student moved up a year"
    stageYear: { type: Number, default: 1 },
    milestones: [milestoneSchema],
    changeLog: [changeLogSchema],
  },
  { timestamps: true }
);

journeyPlanSchema.statics.TOOLS = TOOLS;
journeyPlanSchema.statics.CATEGORIES = CATEGORIES;

module.exports = mongoose.model('JourneyPlan', journeyPlanSchema);
