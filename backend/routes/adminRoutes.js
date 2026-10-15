const express = require('express');
const router = express.Router();
const { protectAdmin } = require('../middleware/authMiddleware');
const {
    getCandidates,
    getCandidateDetails,
    updateCandidateStatus,
    updateCandidateCredits,
    getAnalytics,
    getStats,
    getReviews,
    deleteReview,
    getRadar,
} = require('../controllers/adminController');

// All routes here should be protected by Admin Auth
router.use(protectAdmin);

router.get('/candidates', getCandidates);
router.get('/candidates/:id', getCandidateDetails);
router.put('/candidates/:id/status', updateCandidateStatus);
router.put('/candidates/:id/credits', updateCandidateCredits);

router.get('/analytics', getAnalytics);
router.get('/stats', getStats);
router.get('/radar', getRadar);

router.get('/reviews', getReviews);
router.delete('/reviews/:id', deleteReview);

module.exports = router;
