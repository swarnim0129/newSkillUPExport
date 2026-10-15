const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { checkOnboarding, onboardCandidate } = require('../controllers/onboardingController');
const upload = require('../middleware/uploadMiddleware');
const cloudinary = require('../config/cloudinary');
const stream = require('stream');

router.get('/check', protect, checkOnboarding);
router.post('/candidate', protect, onboardCandidate);

// Upload resume PDF to Cloudinary and return URL
router.post('/upload/resume', protect, upload.single('resume'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'No file uploaded' });
        }

        const uploadPromise = new Promise((resolve, reject) => {
            const uploadStream = cloudinary.uploader.upload_stream(
                {
                    folder: 'candidate_resumes',
                    resource_type: 'raw',
                    use_filename: true,
                    unique_filename: true,
                },
                (error, result) => {
                    if (error) reject(error);
                    else resolve(result);
                }
            );
            const bufferStream = new stream.PassThrough();
            bufferStream.end(req.file.buffer);
            bufferStream.pipe(uploadStream);
        });

        const result = await uploadPromise;
        res.status(200).json({
            success: true,
            url: result.secure_url,
        });
    } catch (error) {
        console.error('Resume upload error:', error);
        res.status(500).json({ message: 'Failed to upload resume. ' + (error.message || '') });
    }
});

module.exports = router;
