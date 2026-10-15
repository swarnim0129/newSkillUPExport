const Candidate = require('../models/Candidate');
const Mentor = require('../models/Mentor');
const Classroom = require('../models/Classroom');
const ClassMember = require('../models/ClassMember');
const Assignment = require('../models/Assignment');
const StudentProfile = require('../models/StudentProfile');
const Review = require('../models/Review');

// @desc    Verify admin code (Legacy)
exports.verifyCode = async (req, res) => {
    res.status(400).json({ message: 'Use /admin/login instead' });
};

// @desc    Get all candidates
// @route   GET /api/admin/candidates
exports.getCandidates = async (req, res) => {
    try {
        const candidates = await Candidate.find().sort({ createdAt: -1 });
        res.json(candidates);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
};

// @desc    Get candidate details, their journey basics and classes
// @route   GET /api/admin/candidates/:id
exports.getCandidateDetails = async (req, res) => {
    try {
        const candidate = await Candidate.findById(req.params.id);
        if (!candidate) {
            return res.status(404).json({ message: 'Candidate not found' });
        }

        const [profile, memberships] = await Promise.all([
            StudentProfile.findOne({ candidate: candidate._id }).select('branch semesterAtSetup goal setupAt').lean(),
            ClassMember.find({ candidate: candidate._id }).lean(),
        ]);
        const classes = await Classroom.find({ _id: { $in: memberships.map((m) => m.classroom) } })
            .populate('mentor', 'name department')
            .select('name section mentor')
            .lean();

        res.json({
            success: true,
            candidate,
            journey: profile,
            classes: classes.map((c) => ({
                id: String(c._id),
                name: c.name,
                section: c.section,
                mentor: c.mentor ? c.mentor.name : '',
            })),
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
};

// @desc    Update candidate status (Ban)
// @route   PUT /api/admin/candidates/:id/status
exports.updateCandidateStatus = async (req, res) => {
    try {
        const { status } = req.body; // 'active', 'suspended'
        const candidate = await Candidate.findByIdAndUpdate(
            req.params.id,
            { status },
            { new: true }
        );
        res.json(candidate);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
};

// @desc    Update candidate credits
// @route   PUT /api/admin/candidates/:id/credits
exports.updateCandidateCredits = async (req, res) => {
    try {
        const { credits } = req.body;
        if (credits === undefined || credits < 0 || !Number.isInteger(credits)) {
            return res.status(400).json({ message: 'Credits must be a non-negative integer' });
        }
        const candidate = await Candidate.findByIdAndUpdate(
            req.params.id,
            { credits },
            { new: true }
        );
        if (!candidate) {
            return res.status(404).json({ message: 'Candidate not found' });
        }
        res.json({ success: true, credits: candidate.credits });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
};

// Monthly sign-ups for one collection, last 12 months that have data
const getMonthlyGrowth = (Model) => Model.aggregate([
    { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } }, count: { $sum: 1 } } },
    { $sort: { _id: 1 } },
    { $limit: 12 },
]);

// @desc    Get analytics
// @route   GET /api/admin/analytics
exports.getAnalytics = async (req, res) => {
    try {
        const [totalStudents, withJourney, totalMentors, totalClasses, students, mentors, classes] = await Promise.all([
            Candidate.countDocuments(),
            StudentProfile.countDocuments(),
            Mentor.countDocuments(),
            Classroom.countDocuments(),
            getMonthlyGrowth(Candidate),
            getMonthlyGrowth(Mentor),
            getMonthlyGrowth(Classroom),
        ]);
        res.json({
            overview: { totalStudents, withJourney, totalMentors, totalClasses },
            graphs: { students, mentors, classes },
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
};

// @desc    Get dashboard stats (Dashboard Header)
// @route   GET /api/admin/stats
exports.getStats = async (req, res) => {
    try {
        const [students, withJourney, mentors, classes, activeClasses, memberships, classwork] = await Promise.all([
            Candidate.countDocuments(),
            StudentProfile.countDocuments(),
            Mentor.countDocuments(),
            Classroom.countDocuments(),
            Classroom.countDocuments({ archived: false }),
            ClassMember.countDocuments(),
            Assignment.countDocuments(),
        ]);
        res.json({
            students: { total: students, withJourney },
            mentors: { total: mentors },
            classes: { total: classes, active: activeClasses, memberships },
            classwork: { total: classwork },
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
};

// @desc    Get all reviews (Admin)
// @route   GET /api/admin/reviews
exports.getReviews = async (req, res) => {
    try {
        const reviews = await Review.find()
            .sort({ createdAt: -1 })
            .lean();

        res.json({
            success: true,
            count: reviews.length,
            reviews
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
};

// @desc    Delete a review (Admin)
// @route   DELETE /api/admin/reviews/:id
exports.deleteReview = async (req, res) => {
    try {
        const review = await Review.findById(req.params.id);
        if (!review) return res.status(404).json({ message: 'Review not found' });

        await review.deleteOne();

        res.json({
            success: true,
            message: 'Review deleted'
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
};

// @desc    Placement radar: who is ready for which tier now, and by the drive date
// @route   GET /api/admin/radar?driveDate=YYYY-MM-DD
exports.getRadar = async (req, res) => {
    try {
        const JourneyPlan = require('../models/JourneyPlan');
        const PracticeProgress = require('../models/PracticeProgress');
        const { readiness, weeklyPace } = require('../services/journey/forecastService');
        const { patternOverview } = require('../services/practice/masteryService');
        const { journeyNow, currentSemester, yearOfSemester } = require('../services/journey/clock');
        const { sandbox } = require('../services/insightsService');

        const now = new Date();
        let drive = req.query.driveDate ? new Date(req.query.driveDate) : null;
        if (!drive || Number.isNaN(drive.getTime()) || drive < now) {
            drive = new Date(now.getFullYear() + (now.getMonth() >= 7 ? 1 : 0), 7, 1);
        }
        const weeks = Math.max(0, (drive - now) / (7 * 86400000));

        const profiles = await StudentProfile.find({}).limit(3000).lean();
        const ids = profiles.map((p) => p.candidate);
        const [plans, progress, candidates] = await Promise.all([
            JourneyPlan.find({ candidate: { $in: ids } }).lean(),
            PracticeProgress.find({ candidate: { $in: ids } }).lean(),
            Candidate.find({ _id: { $in: ids } }).select('firstName lastName email').lean(),
        ]);
        const planBy = Object.fromEntries(plans.map((p) => [String(p.candidate), p]));
        const progressBy = {};
        progress.forEach((p) => { (progressBy[String(p.candidate)] = progressBy[String(p.candidate)] || []).push(p); });
        const nameBy = Object.fromEntries(candidates.map((c) => [String(c._id), `${c.firstName || ''} ${c.lastName || ''}`.trim() || c.email]));

        const tierOf = (v) => (v >= 85 ? 'dream' : v >= 75 ? 'product' : v >= 60 ? 'service' : 'building');
        const rows = profiles.filter((p) => planBy[String(p.candidate)]).map((p) => {
            const clock = journeyNow(p);
            const levels = patternOverview(progressBy[String(p.candidate)] || [], clock).levels;
            const today = readiness(sandbox(p), planBy[String(p.candidate)], levels).value;
            const pace = weeklyPace(p.readinessHistory || [], clock);
            const projected = Math.max(0, Math.min(100, Math.round(today + (pace || 0) * weeks)));
            const semester = currentSemester(p, clock);
            return {
                candidateId: String(p.candidate),
                name: nameBy[String(p.candidate)] || 'Student',
                branch: p.branch,
                year: yearOfSemester(semester),
                goal: (p.goal && p.goal.type) || 'undecided',
                readiness: today,
                pace,
                projected,
                tierNow: tierOf(today),
                tierAtDrive: tierOf(projected),
            };
        });

        const placement = rows.filter((r) => r.goal === 'placement');
        const tiers = ['dream', 'product', 'service', 'building'];
        const count = (list, key) => Object.fromEntries(tiers.map((t) => [t, list.filter((r) => r[key] === t).length]));
        const branches = [...new Set(placement.map((r) => r.branch))].sort();

        res.json({
            success: true,
            driveDate: drive,
            weeksToDrive: Math.round(weeks),
            totals: { students: rows.length, placement: placement.length },
            now: count(placement, 'tierNow'),
            atDrive: count(placement, 'tierAtDrive'),
            byBranch: branches.map((b) => {
                const list = placement.filter((r) => r.branch === b);
                return { branch: b, students: list.length, readyNow: list.filter((r) => r.readiness >= 75).length, readyAtDrive: list.filter((r) => r.projected >= 75).length, average: list.length ? Math.round(list.reduce((a, r) => a + r.readiness, 0) / list.length) : 0 };
            }),
            byYear: [1, 2, 3, 4].map((y) => ({ year: y, students: rows.filter((r) => r.year === y).length, average: (() => { const l = rows.filter((r) => r.year === y); return l.length ? Math.round(l.reduce((a, r) => a + r.readiness, 0) / l.length) : 0; })() })),
            atRisk: placement.filter((r) => r.year >= 3 && r.projected < 60).sort((a, b) => a.projected - b.projected).slice(0, 25),
            readyNow: placement.filter((r) => r.readiness >= 75).sort((a, b) => b.readiness - a.readiness).slice(0, 25),
            crossing: placement.filter((r) => r.readiness < 75 && r.projected >= 75).length,
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
};
