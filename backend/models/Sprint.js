const mongoose = require('mongoose');

// Panic mode: an hour-by-hour plan for an exam that is days away
const blockSchema = new mongoose.Schema({
  startAt: { type: Date, required: true },
  minutes: { type: Number, required: true, min: 10, max: 240 },
  kind: { type: String, enum: ['learn', 'practice', 'review', 'break', 'sleep'], required: true },
  title: { type: String, required: true, maxlength: 140 },
  topic: { type: String, default: '', maxlength: 120 },
  tip: { type: String, default: '', maxlength: 300 },
  done: { type: Boolean, default: false },
});

const sprintSchema = new mongoose.Schema(
  {
    candidate: { type: mongoose.Schema.Types.ObjectId, ref: 'Candidate', required: true, index: true },
    subject: { type: String, required: true, maxlength: 100 },
    examAt: { type: Date, required: true },
    hoursPerDay: { type: Number, default: 6, min: 1, max: 14 },
    topics: [{ name: String, confidence: { type: Number, min: 1, max: 3, default: 2 } }],
    blocks: [blockSchema],
    generatedBy: { type: String, enum: ['ai', 'template'], default: 'template' },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Sprint', sprintSchema);
