const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/authMiddleware');
const {
  getJourney,
  setupJourney,
  updateProfile,
  updateMilestone,
  postEvidence,
  replan,
  demoAdvance,
  demoPersona,
  getThread,
  postMessage,
  getForecast,
  addExam,
  removeExam,
} = require('../controllers/journeyController');

// The journey belongs to a student, so every route needs an onboarded candidate
router.use(protect, authorize('candidate'));

router.get('/', getJourney);
router.post('/setup', setupJourney);
router.patch('/profile', updateProfile);
router.patch('/milestones/:id', updateMilestone);
router.post('/evidence', postEvidence);
router.post('/replan', replan);

router.get('/forecast', getForecast);
router.post('/exams', addExam);
router.delete('/exams/:id', removeExam);

router.get('/companion', getThread);
router.post('/companion', postMessage);

router.post('/demo/advance', demoAdvance);
router.post('/demo/persona', demoPersona);

module.exports = router;
