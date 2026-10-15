const { hasKeys } = require('../utils/geminiKeyManager');
const { generateJson } = require('../services/aiJson');

const RESUME_ANALYST_PROMPT = `You are an expert ATS (Applicant Tracking System) analyst and Career Coach. Analyze the following resume text thoroughly.
Return ONLY a valid JSON object with this exact structure (no markdown, no backticks, no extra text):
{
  "overallScore": number (0-100),
  "sections": {
    "impact": number (0-100),
    "formatting": number (0-100),
    "keywords": number (0-100),
    "experience": number (0-100)
  },
  "feedback": {
    "critical": ["string array of 2-4 critical issues that must be fixed"],
    "suggestions": ["string array of 2-4 improvement suggestions"],
    "strengths": ["string array of 2-4 strong points"]
  },
  "keywords": ["array of 10-15 hard skills/technologies actually found in the resume"],
  "missingKeywords": ["array of 5-8 critical missing skills for this candidate's apparent target role"],
  "atsCompatibility": "Low" | "Medium" | "High",
  "atsCompatibilityReason": "brief 1-2 sentence explanation",
  "summary": "2-3 sentence professional profile summary based on the resume content",
  "careerPath": {
    "role": "suggested ideal job title based on the resume",
    "reason": "1-2 sentence explanation of why this role fits"
  }
}`;

const ATS_LEVELS = ['Low', 'Medium', 'High'];

function score(value) {
    const n = Math.round(Number(value));
    return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 0;
}

function strings(value, max) {
    return (Array.isArray(value) ? value : []).map((v) => String(v).trim()).filter(Boolean).slice(0, max);
}

/**
 * The model sometimes answers "Moderate" or a score as text. Bring every field
 * into the shape the database expects, so a valid analysis is never lost on save.
 */
function normalizeAnalysis(raw) {
    if (!raw || typeof raw !== 'object') throw new Error('Analysis was not an object');
    const sections = raw.sections || {};
    const feedback = raw.feedback || {};
    const atsText = String(raw.atsCompatibility || '').toLowerCase();
    const ats = ATS_LEVELS.find((level) => atsText.startsWith(level.toLowerCase()))
        || (/moderate|average|fair/.test(atsText) ? 'Medium' : /strong|excellent|good/.test(atsText) ? 'High' : /poor|weak/.test(atsText) ? 'Low' : 'Medium');
    return {
        overallScore: score(raw.overallScore),
        sections: {
            impact: score(sections.impact),
            formatting: score(sections.formatting),
            keywords: score(sections.keywords),
            experience: score(sections.experience),
        },
        feedback: {
            critical: strings(feedback.critical, 6),
            suggestions: strings(feedback.suggestions, 6),
            strengths: strings(feedback.strengths, 6),
        },
        keywords: strings(raw.keywords, 20),
        missingKeywords: strings(raw.missingKeywords, 12),
        atsCompatibility: ats,
        atsCompatibilityReason: String(raw.atsCompatibilityReason || '').slice(0, 500),
        summary: String(raw.summary || '').slice(0, 1000),
        careerPath: {
            role: String((raw.careerPath && raw.careerPath.role) || '').slice(0, 120),
            reason: String((raw.careerPath && raw.careerPath.reason) || '').slice(0, 500),
        },
    };
}
const ResumeAnalysis = require('../models/ResumeAnalysis');
const Candidate = require('../models/Candidate');
const UserActivity = require('../models/UserActivity');
const { quoteCharge, applyCharge, refundCharge } = require('../services/creditService');
const { recordEvidence } = require('../services/evidenceService');

// @desc    Analyze a resume PDF
// @route   POST /api/resume/analyze
// @access  Private (Candidate)
exports.analyzeResume = async (req, res) => {
    // Set once a charge is taken; refunded in `finally` unless the analysis is delivered
    let pendingCharge = null;
    let delivered = false;
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'No file provided' });
        }

        if (!hasKeys()) {
            return res.status(500).json({ message: 'Gemini API key not configured' });
        }

        // --- Credit enforcement (server-side) ---
        const candidate = await Candidate.findById(req.user._id);
        if (!candidate) return res.status(404).json({ message: 'Candidate not found' });

        const ANALYSIS_COST = 10;
        // First analysis is free; later ones cost credits
        const quote = quoteCharge(candidate, { freeFlag: 'freeAnalysisUsed', cost: ANALYSIS_COST });
        const charged = quote.ok ? await applyCharge(candidate._id, quote) : null;
        if (!charged) {
            return res.status(402).json({
                message: 'Insufficient credits for resume analysis',
                creditsRequired: ANALYSIS_COST,
                creditsAvailable: candidate.credits,
                freeUsed: true,
            });
        }
        pendingCharge = quote;
        // --- End credit enforcement ---

        // Parse PDF
        const pdfParse = require('pdf-parse');
        let resumeText = '';

        try {
            const pdfData = await pdfParse(req.file.buffer);
            resumeText = pdfData.text;
        } catch (pdfError) {
            console.error('PDF parsing error:', pdfError);
            return res.status(400).json({ message: 'Failed to parse PDF file. Make sure it is a valid PDF.' });
        }

        if (!resumeText || resumeText.trim().length === 0) {
            return res.status(400).json({ message: 'No text could be extracted from the PDF' });
        }

        let analysis;
        try {
            // Retries and backup models: Gemini often answers "high demand"
            const raw = await generateJson(`Analyze this resume:\n\n${resumeText}`, { system: RESUME_ANALYST_PROMPT });
            analysis = normalizeAnalysis(raw);
        } catch (aiError) {
            console.error('Resume analysis AI error:', aiError.message);
            return res.status(503).json({ message: 'The AI analyser is busy right now. Nothing was charged; please try again in a minute.' });
        }

        // Save to database
        const saved = await ResumeAnalysis.create({
            candidate: req.user._id,
            fileName: req.file.originalname || 'resume.pdf',
            resumeText: resumeText.substring(0, 500),
            analysis,
        });

        // Log activity for dashboard
        UserActivity.create({
            candidate: req.user._id,
            type: 'resume_analyzed',
            metadata: { title: 'Resume Analyzed', subtitle: `"${req.file.originalname}" scored ${analysis.overallScore || 0}/100.` }
        }).catch(err => console.error('Activity log error:', err));

        recordEvidence({
            clerkId: req.clerkId,
            type: 'resume_analyzed',
            topic: 'Resume',
            score: Number(analysis.overallScore) || 0,
            refId: String(saved._id),
            meta: { fileName: req.file.originalname, missingKeywords: (analysis.missingKeywords || []).slice(0, 8) },
        }).catch(err => console.error('Evidence log error:', err.message));

        delivered = true;
        res.status(200).json({
            success: true,
            _id: saved._id,
            analysis,
        });
    } catch (error) {
        console.error('Resume analysis error:', error);
        res.status(500).json({ message: 'Failed to analyze resume', error: error.message });
    } finally {
        if (pendingCharge && !delivered) await refundCharge(req.user._id, pendingCharge);
    }
};

// @desc    Get all saved analyses for the logged-in candidate
// @route   GET /api/resume/analyses
// @access  Private (Candidate)
exports.getAnalyses = async (req, res) => {
    try {
        const analyses = await ResumeAnalysis.find({ candidate: req.user._id })
            .sort({ createdAt: -1 })
            .select('fileName analysis.overallScore analysis.atsCompatibility createdAt')
            .lean();

        res.status(200).json({ success: true, analyses });
    } catch (error) {
        console.error('Get analyses error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

// @desc    Get a single analysis by ID
// @route   GET /api/resume/analyses/:id
// @access  Private (Candidate)
exports.getAnalysis = async (req, res) => {
    try {
        const analysis = await ResumeAnalysis.findOne({
            _id: req.params.id,
            candidate: req.user._id,
        }).lean();

        if (!analysis) {
            return res.status(404).json({ message: 'Analysis not found' });
        }

        res.status(200).json({ success: true, analysis });
    } catch (error) {
        console.error('Get analysis error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

// @desc    Delete a saved analysis
// @route   DELETE /api/resume/analyses/:id
// @access  Private (Candidate)
exports.deleteAnalysis = async (req, res) => {
    try {
        const result = await ResumeAnalysis.findOneAndDelete({
            _id: req.params.id,
            candidate: req.user._id,
        });

        if (!result) {
            return res.status(404).json({ message: 'Analysis not found' });
        }

        res.status(200).json({ success: true });
    } catch (error) {
        console.error('Delete analysis error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};
