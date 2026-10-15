const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/authMiddleware');
const c = require('../controllers/classController');
const live = require('../controllers/liveController');

// Student side of classrooms
router.use(protect, authorize('candidate'));

router.get('/', c.listClasses);
router.post('/join', c.joinClass);
router.get('/:id', c.getClass);
router.delete('/:id/membership', c.leaveClass);
router.post('/:id/posts', c.createPost);
router.delete('/:id/posts/:postId', c.deletePost);
router.post('/:id/posts/:postId/comments', c.addComment);
router.get('/:id/assignments/:assignmentId', c.getAssignment);
router.post('/:id/assignments/:assignmentId/submit', c.submitAssignment);
router.post('/:id/assignments/:assignmentId/unsubmit', c.unsubmitAssignment);
router.get('/:id/battle', live.studentGetBattle);
router.post('/:id/battle/join', live.joinBattle);
router.post('/:id/battle/answer', live.answerBattle);

module.exports = router;
