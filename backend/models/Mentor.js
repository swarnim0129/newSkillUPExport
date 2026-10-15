const mongoose = require('mongoose');

// A faculty member who follows a group of students. Students link to a
// mentor by entering the mentor's code, so consent is explicit.
const mentorSchema = new mongoose.Schema(
  {
    clerkId: { type: String, required: true, unique: true },
    name: { type: String, required: true, maxlength: 100 },
    department: { type: String, default: '', maxlength: 100 },
    email: { type: String, default: '' },
    code: { type: String, required: true, unique: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Mentor', mentorSchema);
