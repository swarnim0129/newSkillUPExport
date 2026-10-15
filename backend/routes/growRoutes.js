const express = require('express');
const multer = require('multer');
const router = express.Router();
const { protect, authorize } = require('../middleware/authMiddleware');
const g = require('../controllers/growController');

// Photos of notes and PDFs can be larger than the default upload limit
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

router.use(protect, authorize('candidate'));

router.post('/what-if', g.whatIf);
router.post('/what-if/apply', g.applyWhatIf);
router.get('/rival', g.rival);
router.get('/wellbeing', g.wellbeing);
router.put('/wellbeing', g.wellbeingSettings);
router.post('/wellbeing/ease', g.easePlan);
router.get('/dna', g.dna);

router.get('/passport', g.getPassport);
router.put('/passport', g.updatePassport);

router.post('/future-self', g.futureSelf);
router.get('/voice/companion', g.companionVoice);
router.post('/voice/companion/session', g.companionVoiceSession);
router.get('/voice/future', g.futureVoice);

router.get('/sprints', g.listSprints);
router.post('/sprints', g.createSprint);
router.patch('/sprints/:id/blocks/:blockId', g.toggleBlock);
router.delete('/sprints/:id', g.deleteSprint);

router.get('/snaps', g.listSnaps);
router.post('/snaps', upload.single('file'), g.createSnap);
router.post('/snaps/:id/plan', g.snapToPlan);
router.delete('/snaps/:id', g.deleteSnap);

router.get('/squads', g.listSquads);
router.post('/squads', g.createSquad);
router.post('/squads/join', g.joinSquad);
router.delete('/squads/:id/membership', g.leaveSquad);
router.post('/squads/:id/nudge', g.nudge);

router.get('/interviews', g.listInterviews);
router.get('/interviews/:id/replay', g.replay);
router.post('/interviews/:id/replay/practice', g.replayToPlan);
router.post('/interviews/:id/replay/:turn/better', g.betterAnswer);

module.exports = router;
