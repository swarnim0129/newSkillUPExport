const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/authMiddleware');
const {
  getDsaOverview,
  getDsaProblem,
  getDsaHint,
  submitDsaAttempt,
  getLab,
  createLabSet,
  submitLabSet,
  getJournal,
} = require('../controllers/practiceController');

router.use(protect, authorize('candidate'));

router.get('/dsa', getDsaOverview);
router.get('/dsa/problems/:slug', getDsaProblem);
router.post('/dsa/problems/:slug/hint', getDsaHint);
router.post('/dsa/problems/:slug/attempts', submitDsaAttempt);

router.get('/lab', getLab);
router.post('/lab/sets', createLabSet);
router.post('/lab/sets/:id/submit', submitLabSet);

router.get('/journal', getJournal);

module.exports = router;
