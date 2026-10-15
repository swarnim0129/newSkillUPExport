const mongoose = require('mongoose');

// A study squad of 2 to 4 students who keep a shared daily streak
const squadSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, maxlength: 60 },
    code: { type: String, required: true, unique: true },
    members: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Candidate' }],
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Candidate', default: null },
    // Set when a mentor formed the squad inside a class
    classroom: { type: mongoose.Schema.Types.ObjectId, ref: 'Classroom', default: null },
    focus: { type: String, default: '', maxlength: 100 },
    lastNudges: [{ _id: false, from: mongoose.Schema.Types.ObjectId, to: mongoose.Schema.Types.ObjectId, at: Date }],
  },
  { timestamps: true }
);

squadSchema.index({ members: 1 });

module.exports = mongoose.model('Squad', squadSchema);
