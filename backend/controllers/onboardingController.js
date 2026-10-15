const Candidate = require('../models/Candidate');
const User = require('../models/User'); // Admin?

// @desc    Check onboarding status
// @route   GET /api/onboarding/check
// @access  Private
exports.checkOnboarding = async (req, res) => {
    try {
        const clerkId = req.clerkId;
        // req.user might be populated by middleware if found by clerkId
        
        // If middleware found it by clerkId
        if (req.user && req.user.role !== 'new') {
            const redirectUrl = req.user.role === 'mentor' ? '/mentor' : '/candidate/journey';
            return res.status(200).json({
                exists: true,
                role: req.user.role,
                redirectUrl,
                user: req.user
            });
        }

        // If not found by clerkId, check by email (Account Linking)
        // We need the email from Clerk token properties.
        // Middleware put verifiedToken in req.auth.
        // We might need to fetch user details from Clerk if email isn't in token claims, 
        // but typically standard claims have it or we can pass it from frontend?
        // Let's assume we might not catch it by email safely without verifying email ownership.
        // BUT, user specifically said "i already have this mail in db".
        // Let's rely on the middleware's effort or do a secondary lookup here.
        
        // Since middleware only checked clerkId, let's check email here if we can get it.
        // We can get email from `req.auth` if added to jwt template, or request user.
        // Let's trust the frontend passing it? No, unsecure.
        // We'll proceed with "not found" if clerkId doesn't match. 
        // Wait, if I want to support "existing email", I should look it up.
        // I will add a lookup by email if I can retrieve it from the clerk user object.
        
        // Handling the "Admin" case:
        // Check 'User' collection for admin role — by clerkId OR email
        let adminUser = await User.findOne({ clerkId });
        
        // If not found by clerkId, try email fallback
        if (!adminUser && req.clerkEmail) {
            adminUser = await User.findOne({ email: req.clerkEmail, role: 'admin' });
            if (adminUser) {
                adminUser.clerkId = clerkId;
                await adminUser.save();
                console.log(`✅ Admin account linked by email: ${req.clerkEmail} → new clerkId: ${clerkId}`);
            }
        }

        if (adminUser && adminUser.role === 'admin') {
             return res.status(200).json({
                exists: true,
                role: 'admin',
                redirectUrl: '/admin/dashboard',
                user: adminUser
            });
        }

        res.status(200).json({ exists: false });
        
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
};

// @desc    Complete onboarding (Candidate)
// @route   POST /api/onboarding/candidate
// @access  Private
exports.onboardCandidate = async (req, res) => {
    try {
        const clerkId = req.clerkId;
        const data = req.body;

        if (req.user && req.user.role === 'mentor') {
            return res.status(409).json({ message: 'This is a faculty account. Open your classes instead.', redirectUrl: '/mentor' });
        }

        // Check if candidate already exists
        let candidate = await Candidate.findOne({ clerkId });
        if (candidate) {
            return res.status(400).json({ message: 'Candidate already exists' });
        }

        // --- Generate unique referral code ---
        const crypto = require('crypto');
        let referralCode;
        let codeExists = true;
        while (codeExists) {
            referralCode = crypto.randomBytes(4).toString('hex').toUpperCase(); // 8-char hex
            codeExists = await Candidate.findOne({ referralCode });
        }

        // --- Process incoming referral code (if provided) ---
        let referredBy = null;
        const incomingRefCode = data.referralCode;

        if (incomingRefCode) {
            const referrer = await Candidate.findOne({ referralCode: incomingRefCode });

            if (referrer) {
                // Block self-referral (same clerkId)
                if (referrer.clerkId === clerkId) {
                    console.warn('Self-referral blocked for clerkId:', clerkId);
                } else {
                    referredBy = referrer._id;
                }
            } else {
                console.warn('Invalid referral code provided:', incomingRefCode);
            }
        }

        // Only profile fields may come from the client — never credits, XP or usage flags
        const allowedFields = [
            'email', 'firstName', 'lastName', 'phone', 'location',
            'skills', 'experience', 'education',
            'resumeUrl', 'linkedIn', 'portfolio', 'jobPreferences'
        ];
        const candidateData = {};
        for (const field of allowedFields) {
            if (data[field] !== undefined) candidateData[field] = data[field];
        }

        candidate = await Candidate.create({
            clerkId,
            ...candidateData,
            referralCode,
            referredBy,
            profileComplete: true
        });

        // Reward the referrer only once the new account really exists
        if (referredBy) {
            await Candidate.findByIdAndUpdate(referredBy, {
                $inc: { credits: 10, referralCount: 1, totalCreditsEarned: 10 }
            });
        }

        res.status(201).json({
            success: true,
            redirectUrl: '/candidate/journey',
            user: candidate
        });
    } catch (error) {
        console.error(error);
        res.status(400).json({ message: error.message });
    }
};
