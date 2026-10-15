const mongoose = require('mongoose');

const userActivitySchema = new mongoose.Schema({
    candidate: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Candidate',
        required: true,
        index: true
    },
    type: {
        type: String,
        enum: ['resume_analyzed', 'resume_generated', 'interview_taken', 'application_sent', 'badge_unlocked', 'credits_spent'],
        required: true
    },
    metadata: {
        title: String,
        subtitle: String
    }
}, { timestamps: true });

userActivitySchema.index({ candidate: 1, createdAt: -1 });
userActivitySchema.index({ candidate: 1, type: 1 });

module.exports = mongoose.model('UserActivity', userActivitySchema);
