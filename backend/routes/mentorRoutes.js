const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/authMiddleware');
const m = require('../controllers/mentorController');
const live = require('../controllers/liveController');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// Any signed-in account without a role can register as faculty. Everything
// else needs a mentor account, and students only appear in a mentor's view
// after they join one of the mentor's classes with its code.
router.use(protect);
router.get('/me', m.getMe);
router.post('/register', m.register);

router.use(authorize('mentor'));
router.patch('/me', m.updateMe);
router.get('/catalog', m.getCatalog);

router.get('/classes', m.listClasses);
router.post('/classes', m.createClass);
router.get('/classes/:id', m.getClass);
router.patch('/classes/:id', m.updateClass);
router.delete('/classes/:id', m.deleteClass);
router.post('/classes/:id/code', m.resetCode);
router.get('/classes/:id/insights', m.getInsights);
router.post('/classes/:id/quiz-draft', m.draftQuiz);
router.delete('/classes/:id/members/:candidateId', m.removeMember);

router.post('/classes/:id/posts', m.createPost);
router.patch('/classes/:id/posts/:postId', m.updatePost);
router.delete('/classes/:id/posts/:postId', m.deletePost);
router.post('/classes/:id/posts/:postId/comments', m.addComment);

router.post('/classes/:id/assignments', m.createAssignment);
router.get('/classes/:id/assignments/:assignmentId', m.getAssignment);
router.patch('/classes/:id/assignments/:assignmentId', m.updateAssignment);
router.delete('/classes/:id/assignments/:assignmentId', m.deleteAssignment);
router.put('/classes/:id/assignments/:assignmentId/submissions/:candidateId', m.gradeSubmission);
router.post('/classes/:id/assignments/:assignmentId/nudge', m.nudge);

router.get('/students/:candidateId', m.getStudent);
router.post('/students/:candidateId/note', m.sendNote);

router.get('/classes/:id/battle', live.mentorGetBattle);
router.post('/classes/:id/battle', live.createBattle);
router.post('/classes/:id/battle/:battleId/:action', live.controlBattle);
router.get('/classes/:id/squads', live.classSquads);
router.post('/classes/:id/squads', live.formSquads);
router.post('/classes/:id/syllabus', upload.single('file'), live.readSyllabus);
router.post('/classes/:id/syllabus/apply', live.applySyllabus);
router.get('/classes/:id/dna', m.getClassDna);

router.post('/demo-class', m.createDemoClass);

module.exports = router;
