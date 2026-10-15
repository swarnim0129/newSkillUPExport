const SavedResume = require('../models/SavedResume');
const Candidate = require('../models/Candidate');
const cloudinary = require('../config/cloudinary');
const stream = require('stream');
const UserActivity = require('../models/UserActivity');
const { quoteCharge, applyCharge, refundCharge } = require('../services/creditService');
const { recordEvidence } = require('../services/evidenceService');

// @desc    Save a resume (Upload JSON to Cloudinary as raw file)
// @route   POST /api/resumes
// @access  Private (Candidate)
exports.saveResume = async (req, res) => {
    // Set once a charge is taken; refunded in `finally` unless the resume is saved
    let pendingCharge = null;
    let delivered = false;
    try {
        const { title, template, data, resumeId } = req.body;
        
        if (!data) {
            return res.status(400).json({ message: 'Resume data is required' });
        }

        if (!req.user || !req.user._id) {
            console.error('Save resume error: User context missing');
            return res.status(401).json({ message: 'User authentication failed' });
        }

        // --- Credit enforcement (server-side) ---
        const candidate = await Candidate.findById(req.user._id);
        if (!candidate) return res.status(404).json({ message: 'Candidate not found' });

        const SAVE_COST = 10;
        const isPremiumTemplate = template === 'executive';

        // Executive always costs credits; the first save with any other template is free
        const quote = quoteCharge(candidate, {
            freeFlag: 'freeResumeBuilderUsed',
            cost: SAVE_COST,
            alwaysPaid: isPremiumTemplate,
        });
        const charged = quote.ok ? await applyCharge(candidate._id, quote) : null;
        if (!charged) {
            return res.status(402).json({
                message: isPremiumTemplate ? 'Executive template requires credits' : 'Insufficient credits for resume save',
                creditsRequired: SAVE_COST,
                creditsAvailable: candidate.credits,
                freeUsed: true,
            });
        }
        pendingCharge = quote;
        // --- End credit enforcement ---

        const jsonString = JSON.stringify(data);
        const buffer = Buffer.from(jsonString);



        const uploadPromise = new Promise((resolve, reject) => {
            const uploadStream = cloudinary.uploader.upload_stream(
                { 
                    resource_type: 'raw', 
                    folder: 'resumes',
                    public_id: `resume_${req.user._id}_${Date.now()}`,
                    format: 'json'
                },
                (error, result) => {
                    if (error) {
                        console.error('Cloudinary Upload Stream Error:', error);
                        reject(error);
                    }
                    else resolve(result);
                }
            );
            
            const bufferStream = new stream.PassThrough();
            bufferStream.end(buffer);
            bufferStream.pipe(uploadStream);
            
            uploadStream.on('error', (err) => {
                console.error('Upload stream event error:', err);
                reject(err);
            });
        });

        const uploadResult = await uploadPromise;


        let resume;
        if (resumeId) {
            resume = await SavedResume.findOneAndUpdate(
                { _id: resumeId, candidate: req.user._id },
                { title, template, dataUrl: uploadResult.secure_url },
                { new: true, runValidators: true }
            );
        }

        if (!resume) {
            resume = await SavedResume.create({
                candidate: req.user._id,
                title: title || 'Untitled Resume',
                template: template || 'modern',
                dataUrl: uploadResult.secure_url
            });
        }

        // Log activity for dashboard
        UserActivity.create({
            candidate: req.user._id,
            type: 'resume_generated',
            metadata: { title: 'Resume Generated', subtitle: `Created "${title || 'Untitled Resume'}" using ${template || 'modern'} template.` }
        }).catch(err => console.error('Activity log error:', err));

        recordEvidence({
            clerkId: req.clerkId,
            type: 'resume_generated',
            topic: 'Resume',
            refId: String(resume._id),
            meta: { template: template || 'modern' },
        }).catch(err => console.error('Evidence log error:', err.message));

        delivered = true;
        res.status(200).json({ success: true, resume, creditsRemaining: charged.credits });
    } catch (error) {
        console.error('Save resume error:', error);
        res.status(500).json({ 
            message: 'Failed to save resume', 
            error: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined 
        });
    } finally {
        if (pendingCharge && !delivered) await refundCharge(req.user._id, pendingCharge);
    }
};

// @desc    Get all saved resumes for candidate
// @route   GET /api/resumes
// @access  Private (Candidate)
exports.getResumes = async (req, res) => {
    try {
        const resumes = await SavedResume.find({ candidate: req.user._id })
            .sort({ updatedAt: -1 });
        res.status(200).json({ success: true, resumes });
    } catch (error) {
        console.error('Get resumes error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

// @desc    Get single resume
// @route   GET /api/resumes/:id
// @access  Private (Candidate)
exports.getResume = async (req, res) => {
    try {
        const resume = await SavedResume.findOne({ _id: req.params.id, candidate: req.user._id });
        if (!resume) {
            return res.status(404).json({ message: 'Resume not found' });
        }
        res.status(200).json({ success: true, resume });
    } catch (error) {
        console.error('Get resume error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

// @desc    Delete resume
// @route   DELETE /api/resumes/:id
// @access  Private (Candidate)
exports.deleteResume = async (req, res) => {
    try {
        const resume = await SavedResume.findOneAndDelete({ _id: req.params.id, candidate: req.user._id });
        if (!resume) {
            return res.status(404).json({ message: 'Resume not found' });
        }
        res.status(200).json({ success: true });
    } catch (error) {
        console.error('Delete resume error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

// @desc    Deduct fee for exporting premium resume
// @route   POST /api/resumes/export-fee
// @access  Private (Candidate)
exports.deductExportFee = async (req, res) => {
    try {
        const { template } = req.body;
        
        // Only charge for Executive template
        if (template !== 'executive') {
            return res.status(200).json({ success: true, message: 'No fee required' });
        }

        const candidate = await Candidate.findById(req.user._id);
        if (!candidate) {
            return res.status(404).json({ message: 'Candidate not found' });
        }

        const EXPORT_COST = 10;
        
        if (candidate.credits < EXPORT_COST) {
            return res.status(402).json({
                message: 'Insufficient credits for Executive export',
                creditsRequired: EXPORT_COST,
                creditsAvailable: candidate.credits
            });
        }

        // Deduct credits
        candidate.credits -= EXPORT_COST;
        await candidate.save();

        // Log activity
        await UserActivity.create({
            candidate: req.user._id,
            type: 'credits_spent',
            metadata: { 
                title: 'Exported Executive Resume', 
                subtitle: `Spent ${EXPORT_COST} credits to export resume using Executive template.` 
            }
        });

        res.status(200).json({ success: true, creditsRemaining: candidate.credits });
    } catch (error) {
        console.error('Export fee deduction error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

// @desc    Export resume as PDF via LaTeX compilation
// @route   POST /api/resumes/export-pdf
// @access  Private (Candidate)
exports.exportLatexPdf = async (req, res) => {
    try {
        const { fillTemplate } = require('../utils/latexTemplates');
        const { templateId, data } = req.body;

        if (!data || !data.personalInfo) {
            return res.status(400).json({ message: 'Resume data is required' });
        }

        const latexSource = fillTemplate(templateId || 'latex', data);

        // Compile via latex.ytotech.com API
        const apiPayload = {
            compiler: 'pdflatex',
            resources: [
                {
                    main: true,
                    content: latexSource
                }
            ]
        };

        const response = await fetch(
            'https://latex.ytotech.com/builds/sync',
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(apiPayload),
                signal: AbortSignal.timeout(30000),
            }
        );

        if (!response.ok) {
            const errText = await response.text();
            console.error('LaTeX API error:', response.status, errText);
            return res.status(500).json({ message: 'LaTeX compilation failed.', details: errText });
        }

        const pdfArrayBuffer = await response.arrayBuffer();
        const pdfBuffer = Buffer.from(pdfArrayBuffer);

        // Check if we got a PDF back (starts with %PDF)
        if (pdfBuffer.length < 100 || pdfBuffer.toString('utf8', 0, 4) !== '%PDF') {
            console.error('LaTeX compilation failed. Response:', pdfBuffer.toString('utf8', 0, 500));
            return res.status(500).json({ 
                message: 'LaTeX compilation failed. Check your resume data for special characters.',
                details: pdfBuffer.toString('utf8', 0, 500)
            });
        }

        const fileName = `${(data.personalInfo.fullName || 'Resume').replace(/[^a-zA-Z0-9]/g, '_')}_Resume.pdf`;

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
        res.setHeader('Content-Length', pdfBuffer.length);
        res.send(pdfBuffer);

    } catch (error) {
        console.error('LaTeX PDF export error:', error.message);
        if (error.response) {
            console.error('API response status:', error.response.status);
            console.error('API response data:', Buffer.from(error.response.data).toString('utf8', 0, 500));
        }
        res.status(500).json({ message: 'Failed to generate PDF. Please try again.' });
    }
};
