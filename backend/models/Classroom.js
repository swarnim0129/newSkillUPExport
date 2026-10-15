const mongoose = require('mongoose');

// A class a faculty mentor runs, joined by students with a short code
// (like Google Classroom or Teams). Students only become visible to the
// mentor by entering the code themselves.
const classroomSchema = new mongoose.Schema(
  {
    mentor: { type: mongoose.Schema.Types.ObjectId, ref: 'Mentor', required: true, index: true },
    name: { type: String, required: true, maxlength: 100 },
    section: { type: String, default: '', maxlength: 100 },
    subject: { type: String, default: '', maxlength: 100 },
    description: { type: String, default: '', maxlength: 1000 },
    // Index into the banner colours the UI offers
    theme: { type: Number, default: 0, min: 0, max: 5 },
    code: { type: String, required: true, unique: true },
    // When false the code stops working; existing students stay
    joinOpen: { type: Boolean, default: true },
    archived: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Classroom', classroomSchema);
