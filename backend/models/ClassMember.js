const mongoose = require('mongoose');

const classMemberSchema = new mongoose.Schema(
  {
    classroom: { type: mongoose.Schema.Types.ObjectId, ref: 'Classroom', required: true },
    candidate: { type: mongoose.Schema.Types.ObjectId, ref: 'Candidate', required: true, index: true },
    clerkId: { type: String, required: true },
    joinedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

classMemberSchema.index({ classroom: 1, candidate: 1 }, { unique: true });

module.exports = mongoose.model('ClassMember', classMemberSchema);
