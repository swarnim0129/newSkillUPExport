const mongoose = require('mongoose');

// Snap & study: what the AI read from a photo or PDF of notes or a whiteboard
const snapNoteSchema = new mongoose.Schema(
  {
    candidate: { type: mongoose.Schema.Types.ObjectId, ref: 'Candidate', required: true, index: true },
    title: { type: String, required: true, maxlength: 140 },
    subject: { type: String, default: '', maxlength: 100 },
    topics: [String],
    summary: [String],
    formulas: [String],
    questions: [
      {
        _id: false,
        prompt: String,
        options: [String],
        answerIndex: Number,
        explanation: String,
      },
    ],
    flashcards: [{ _id: false, front: String, back: String }],
    fileName: { type: String, default: '' },
    addedToPlan: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model('SnapNote', snapNoteSchema);
