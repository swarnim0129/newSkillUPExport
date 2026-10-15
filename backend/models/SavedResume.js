const mongoose = require('mongoose');

const savedResumeSchema = new mongoose.Schema({
    candidate: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Candidate',
        required: true,
        index: true
    },
    title: {
        type: String,
        required: true,
        default: 'Untitled Resume'
    },
    template: {
        type: String,
        enum: ['classic', 'modern', 'executive', 'latex'],
        default: 'modern'
    },
    dataUrl: {
        type: String,
        required: true
    }
}, { timestamps: true });

module.exports = mongoose.model('SavedResume', savedResumeSchema);
