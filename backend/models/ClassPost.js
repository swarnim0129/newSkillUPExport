const mongoose = require('mongoose');

const commentSchema = new mongoose.Schema({
  authorType: { type: String, enum: ['mentor', 'student'], required: true },
  author: { type: mongoose.Schema.Types.ObjectId, required: true },
  authorName: { type: String, default: '' },
  text: { type: String, required: true, maxlength: 1000 },
  at: { type: Date, default: Date.now },
});

// The class stream: mentor announcements, student questions, and a notice for
// each new piece of classwork. Everyone in the class can comment.
const classPostSchema = new mongoose.Schema(
  {
    classroom: { type: mongoose.Schema.Types.ObjectId, ref: 'Classroom', required: true },
    kind: { type: String, enum: ['announcement', 'question', 'assignment'], required: true },
    authorType: { type: String, enum: ['mentor', 'student'], required: true },
    author: { type: mongoose.Schema.Types.ObjectId, required: true },
    authorName: { type: String, default: '' },
    text: { type: String, default: '', maxlength: 2000 },
    assignment: { type: mongoose.Schema.Types.ObjectId, ref: 'Assignment', default: null },
    pinned: { type: Boolean, default: false },
    comments: [commentSchema],
  },
  { timestamps: true }
);

classPostSchema.index({ classroom: 1, createdAt: -1 });

module.exports = mongoose.model('ClassPost', classPostSchema);
