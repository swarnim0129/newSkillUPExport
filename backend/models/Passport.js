const mongoose = require('mongoose');

// A student's public, verified skill page. Everything shown on it comes from
// results recorded on SkillUp; the student only chooses what to show.
const passportSchema = new mongoose.Schema(
  {
    candidate: { type: mongoose.Schema.Types.ObjectId, ref: 'Candidate', required: true, unique: true },
    handle: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 40 },
    enabled: { type: Boolean, default: false },
    headline: { type: String, default: '', maxlength: 140 },
    show: {
      dsa: { type: Boolean, default: true },
      subjects: { type: Boolean, default: true },
      interviews: { type: Boolean, default: true },
      resume: { type: Boolean, default: true },
      classes: { type: Boolean, default: true },
      journey: { type: Boolean, default: true },
    },
    views: { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Passport', passportSchema);
