const ResumeAnalysis = require('../models/ResumeAnalysis');
const PracticeAttempt = require('../models/PracticeAttempt');
const Candidate = require('../models/Candidate');
const Interview = require('../models/Interview');
const SavedResume = require('../models/SavedResume');
const UserActivity = require('../models/UserActivity');
const GamificationEvent = require('../models/GamificationEvent');

// @desc    Get dashboard statistics for a candidate
// @route   GET /api/candidate/stats
// @access  Private (Candidate)
exports.getDashboardStats = async (req, res) => {
    try {
        const candidateId = req.user._id;
        const clerkId = req.user.clerkId;

        // ──── 1. Career Growth Index (last 12 months) ────
        const now = new Date();
        const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 11, 1);
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

        // Helper: aggregate monthly counts from a model
        const aggregateMonthly = async (model, matchFilter) => {
            const results = await model.aggregate([
                { $match: { ...matchFilter, createdAt: { $gte: twelveMonthsAgo } } },
                {
                    $group: {
                        _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } },
                        count: { $sum: 1 }
                    }
                }
            ]);
            return results;
        };

        // Aggregate: resumes (analyses + saved)
        const [resumeAnalysisCounts, savedResumeCounts, interviewCounts, practiceCounts] = await Promise.all([
            aggregateMonthly(ResumeAnalysis, { candidate: candidateId }),
            aggregateMonthly(SavedResume, { candidate: candidateId }),
            aggregateMonthly(Interview, { clerkId }),
            aggregateMonthly(PracticeAttempt, { candidate: candidateId }),
        ]);

        // Build 12-month growth data
        const growthData = [];
        for (let i = 0; i < 12; i++) {
            const d = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1);
            const year = d.getFullYear();
            const month = d.getMonth() + 1; // 1-indexed

            const findCount = (arr) => {
                const found = arr.find(r => r._id.year === year && r._id.month === month);
                return found ? found.count : 0;
            };

            const resumeCount = findCount(resumeAnalysisCounts) + findCount(savedResumeCounts);
            const interviewCount = findCount(interviewCounts);
            const practiceCount = findCount(practiceCounts);

            growthData.push({
                month: monthNames[d.getMonth()],
                resume: resumeCount,
                interview: interviewCount,
                practice: practiceCount,
            });
        }

        // ──── 2. Skill Proficiency (from latest resume analysis keywords) ────
        const latestAnalysis = await ResumeAnalysis.findOne({ candidate: candidateId })
            .sort({ createdAt: -1 })
            .lean();

        let skillProficiency = null;

        if (latestAnalysis?.analysis?.keywords?.length > 0) {
            // Get all analyses to compute keyword frequency
            const allAnalyses = await ResumeAnalysis.find({ candidate: candidateId })
                .select('analysis.keywords')
                .lean();

            // Count keyword frequency across all analyses
            const keywordFreq = {};
            allAnalyses.forEach(a => {
                (a.analysis?.keywords || []).forEach(kw => {
                    const key = kw.toLowerCase().trim();
                    keywordFreq[key] = (keywordFreq[key] || 0) + 1;
                });
            });

            // Sort by frequency, take top 6
            const topKeywords = Object.entries(keywordFreq)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 6);

            const maxFreq = topKeywords[0]?.[1] || 1;

            skillProficiency = topKeywords.map(([keyword, freq]) => ({
                subject: keyword.charAt(0).toUpperCase() + keyword.slice(1),
                A: Math.round((freq / maxFreq) * 100),
                fullMark: 100,
            }));
        }

        // ──── 3. User Activity Heatmap (last 365 days) ────
        // Aggregate from ALL sources so historical data appears
        const oneYearAgo = new Date();
        oneYearAgo.setDate(oneYearAgo.getDate() - 365);

        const dateGroupStage = {
            $group: {
                _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
                count: { $sum: 1 }
            }
        };

        const [heatResume, heatSaved, heatInterview, heatPractice, heatActivity] = await Promise.all([
            ResumeAnalysis.aggregate([
                { $match: { candidate: candidateId, createdAt: { $gte: oneYearAgo } } },
                dateGroupStage
            ]),
            SavedResume.aggregate([
                { $match: { candidate: candidateId, createdAt: { $gte: oneYearAgo } } },
                dateGroupStage
            ]),
            Interview.aggregate([
                { $match: { clerkId, createdAt: { $gte: oneYearAgo } } },
                dateGroupStage
            ]),
            PracticeAttempt.aggregate([
                { $match: { candidate: candidateId, createdAt: { $gte: oneYearAgo } } },
                dateGroupStage
            ]),
            UserActivity.aggregate([
                { $match: { candidate: candidateId, createdAt: { $gte: oneYearAgo } } },
                dateGroupStage
            ]),
        ]);

        // Merge all heatmap sources
        const activityHeatmap = {};
        [heatResume, heatSaved, heatInterview, heatPractice, heatActivity].forEach(source => {
            source.forEach(entry => {
                activityHeatmap[entry._id] = (activityHeatmap[entry._id] || 0) + entry.count;
            });
        });

        // ──── 4. Recent Milestones (last 10 events from all sources) ────
        const [recentAnalyses, recentResumes, recentInterviews, recentSolves] = await Promise.all([
            ResumeAnalysis.find({ candidate: candidateId })
                .sort({ createdAt: -1 }).limit(5).lean(),
            SavedResume.find({ candidate: candidateId })
                .sort({ createdAt: -1 }).limit(5).lean(),
            Interview.find({ clerkId, status: 'completed' })
                .sort({ createdAt: -1 }).limit(5).lean(),
            PracticeAttempt.find({ candidate: candidateId, kind: 'dsa', passed: true })
                .sort({ createdAt: -1 }).limit(5)
                .select('title topic createdAt')
                .lean(),
        ]);

        const milestones = [];

        recentAnalyses.forEach(a => {
            milestones.push({
                type: 'resume_analyzed',
                title: 'Resume Analyzed',
                subtitle: `"${a.fileName}" scored ${a.analysis?.overallScore || 0}/100.`,
                date: a.createdAt,
                iconType: 'resume',
            });
        });

        recentResumes.forEach(r => {
            milestones.push({
                type: 'resume_generated',
                title: 'Resume Generated',
                subtitle: `Created "${r.title}" using ${r.template} template.`,
                date: r.createdAt,
                iconType: 'resume',
            });
        });

        recentInterviews.forEach(iv => {
            milestones.push({
                type: 'interview_taken',
                title: 'Interview Completed',
                subtitle: `${iv.seniority} ${iv.role} — ${iv.category} interview.`,
                date: iv.createdAt,
                iconType: 'interview',
            });
        });

        recentSolves.forEach(attempt => {
            milestones.push({
                type: 'dsa_solved',
                title: 'Problem Solved',
                subtitle: `Solved "${attempt.title || attempt.topic}" in Practice.`,
                date: attempt.createdAt,
                iconType: 'practice',
            });
        });

        // Sort by date descending and take top 10
        milestones.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

        // ──── 5. Basic stats ────
        const totalSolved = await PracticeAttempt.countDocuments({ candidate: candidateId, kind: 'dsa', passed: true });
        const totalInterviews = await Interview.countDocuments({ clerkId });

        const weeklyStart = new Date();
        weeklyStart.setDate(weeklyStart.getDate() - 7);

        const weeklyXpAgg = await GamificationEvent.aggregate([
            { $match: { candidate: candidateId, occurredAt: { $gte: weeklyStart } } },
            { $group: { _id: null, total: { $sum: '$xpAwarded' } } },
        ]);

        const candidateGamification = await Candidate.findById(candidateId)
            .select('xpTotal level currentStreak longestStreak badges gamificationStats')
            .lean();

        const recentBadges = (candidateGamification?.badges || [])
            .slice()
            .sort((a, b) => new Date(b.unlockedAt).getTime() - new Date(a.unlockedAt).getTime())
            .slice(0, 3);

        res.status(200).json({
            success: true,
            stats: {
                resumeScore: latestAnalysis?.analysis?.overallScore || 0,
                practiceCount: totalSolved,
                interviewCount: totalInterviews,
                skillProficiency,
                growthData,
                activityHeatmap,
                milestones: milestones.slice(0, 10),
                gamification: {
                    xpTotal: candidateGamification?.xpTotal || 0,
                    level: candidateGamification?.level || 1,
                    currentStreak: candidateGamification?.currentStreak || 0,
                    longestStreak: candidateGamification?.longestStreak || 0,
                    weeklyXp: weeklyXpAgg[0]?.total || 0,
                    recentBadges,
                    counters: candidateGamification?.gamificationStats || {},
                    leaderboardSnapshot: null,
                },
            }
        });
    } catch (error) {
        console.error('Get dashboard stats error:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// @desc    Get candidate profile (including referral info)
// @route   GET /api/candidate/profile
// @access  Private (Candidate)
exports.getProfile = async (req, res) => {
    try {
        let candidate = await Candidate.findById(req.user._id);

        if (!candidate) {
            return res.status(404).json({ message: 'Candidate not found' });
        }

        // Auto-generate referral code for existing users who don't have one
        if (!candidate.referralCode) {
            const crypto = require('crypto');
            let referralCode;
            let codeExists = true;
            while (codeExists) {
                referralCode = crypto.randomBytes(4).toString('hex').toUpperCase();
                codeExists = await Candidate.findOne({ referralCode });
            }
            candidate.referralCode = referralCode;
            await candidate.save();
        }

        res.status(200).json({ success: true, profile: candidate.toObject() });
    } catch (error) {
        console.error('Get profile error:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// @desc    Get list of referred candidates
// @route   GET /api/candidate/referrals
// @access  Private (Candidate)
exports.getReferrals = async (req, res) => {
    try {
        const candidateId = req.user._id;

        const referrals = await Candidate.find({ referredBy: candidateId })
            .select('firstName lastName email createdAt')
            .sort({ createdAt: -1 })
            .lean();

        res.status(200).json({
            success: true,
            referrals,
            totalCount: referrals.length
        });
    } catch (error) {
        console.error('Get referrals error:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// @desc    Update candidate profile
// @route   PUT /api/candidate/profile
// @access  Private (Candidate)
exports.updateProfile = async (req, res) => {
    try {
        const allowedFields = [
            'firstName', 'lastName', 'phone', 'location',
            'skills', 'experience', 'education',
            'resumeUrl', 'linkedIn', 'portfolio',
            'jobPreferences'
        ];

        const updates = {};
        for (const field of allowedFields) {
            if (req.body[field] !== undefined) {
                updates[field] = req.body[field];
            }
        }

        updates.updatedAt = Date.now();

        const candidate = await Candidate.findByIdAndUpdate(
            req.user._id,
            { $set: updates },
            { new: true, runValidators: true }
        ).lean();

        if (!candidate) {
            return res.status(404).json({ message: 'Candidate not found' });
        }

        res.status(200).json({ success: true, profile: candidate });
    } catch (error) {
        console.error('Update profile error:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// @desc    Get candidate credits & usage flags
// @route   GET /api/candidate/credits
// @access  Private (Candidate)
exports.getCredits = async (req, res) => {
    try {
        const candidate = await Candidate.findById(req.user._id)
            .select('credits freeAnalysisUsed freeResumeBuilderUsed freeInterviewUsed totalCreditsEarned xpTotal level currentStreak')
            .lean();

        if (!candidate) {
            return res.status(404).json({ message: 'Candidate not found' });
        }

        res.status(200).json({
            success: true,
            credits: candidate.credits,
            freeAnalysisUsed: candidate.freeAnalysisUsed || false,
            freeResumeBuilderUsed: candidate.freeResumeBuilderUsed || false,
            freeInterviewUsed: candidate.freeInterviewUsed || false,
            totalCreditsEarned: candidate.totalCreditsEarned || 0,
            xpTotal: candidate.xpTotal || 0,
            level: candidate.level || 1,
            currentStreak: candidate.currentStreak || 0,
        });
    } catch (error) {
        console.error('Get credits error:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};
