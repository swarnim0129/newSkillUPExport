const mongoose = require('mongoose');

// A live, timed quiz a mentor runs in class (Kahoot style). Students answer from
// their phones; the projector view and the phones poll the same state.
const battleSchema = new mongoose.Schema(
  {
    classroom: { type: mongoose.Schema.Types.ObjectId, ref: 'Classroom', required: true, index: true },
    mentor: { type: mongoose.Schema.Types.ObjectId, ref: 'Mentor', required: true },
    title: { type: String, required: true, maxlength: 120 },
    questions: [
      {
        _id: false,
        prompt: { type: String, required: true },
        options: [String],
        answerIndex: { type: Number, required: true },
        explanation: { type: String, default: '' },
      },
    ],
    secondsPerQuestion: { type: Number, default: 20, min: 5, max: 120 },
    status: { type: String, enum: ['lobby', 'question', 'reveal', 'ended'], default: 'lobby' },
    current: { type: Number, default: -1 },
    questionStartedAt: { type: Date, default: null },
    players: [{ _id: false, candidate: mongoose.Schema.Types.ObjectId, name: String, joinedAt: Date }],
    answers: [
      {
        _id: false,
        candidate: mongoose.Schema.Types.ObjectId,
        index: Number,
        choice: Number,
        correct: Boolean,
        ms: Number,
        points: Number,
      },
    ],
    endedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Battle', battleSchema);
