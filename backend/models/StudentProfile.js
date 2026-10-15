const mongoose = require('mongoose');

const skillSchema = new mongoose.Schema(
  {
    key: { type: String, required: true },
    name: { type: String, required: true },
    // 0-100 estimate built only from results the student actually produced
    level: { type: Number, default: 0, min: 0, max: 100 },
    evidenceCount: { type: Number, default: 0, min: 0 },
    lastScore: { type: Number, default: null },
    updatedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const memoryFactSchema = new mongoose.Schema(
  {
    text: { type: String, required: true, maxlength: 300 },
    source: { type: String, enum: ['setup', 'chat', 'system'], default: 'chat' },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const studentProfileSchema = new mongoose.Schema(
  {
    candidate: { type: mongoose.Schema.Types.ObjectId, ref: 'Candidate', required: true, unique: true },
    clerkId: { type: String, required: true, unique: true },

    college: { type: String, default: '' },
    degree: { type: String, default: 'B.Tech' },
    branch: { type: String, required: true },

    // Where the student stood when the journey was set up. The current semester is
    // derived from this plus elapsed time, so the plan moves forward on its own.
    semesterAtSetup: { type: Number, required: true, min: 1, max: 8 },
    setupAt: { type: Date, default: Date.now },

    goal: {
      type: {
        type: String,
        enum: ['placement', 'higher_studies', 'govt_exam', 'startup', 'undecided'],
        default: 'undecided',
      },
      targetRole: { type: String, default: '' },
      note: { type: String, default: '' },
    },

    hoursPerWeek: { type: Number, default: 8, min: 1, max: 60 },
    interests: [String],

    skills: [skillSchema],
    memory: [memoryFactSchema],

    lastCheckInAt: { type: Date, default: null },

    // Exam periods the plan keeps clear of other work
    exams: [
      {
        title: { type: String, required: true, maxlength: 80 },
        startAt: { type: Date, required: true },
        endAt: { type: Date, required: true },
      },
    ],


    // One readiness reading per day, used to measure pace for the forecast
    readinessHistory: [
      {
        _id: false,
        at: { type: Date, required: true },
        value: { type: Number, required: true, min: 0, max: 100 },
      },
    ],

    // Burnout guard: off until the student turns it on. Sharing with a mentor is separate.
    wellbeing: {
      optIn: { type: Boolean, default: false },
      shareWithMentor: { type: Boolean, default: false },
      // Minutes east of UTC, from the browser, so "late night" means the student's night
      tzOffsetMinutes: { type: Number, default: 330 },
      lastEasedAt: { type: Date, default: null },
    },

    // Demo only: days added to "now" so four years can be shown in minutes
    clockOffsetDays: { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model('StudentProfile', studentProfileSchema);
