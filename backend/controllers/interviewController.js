const Interview = require("../models/Interview");
const { hasKeys } = require("../utils/geminiKeyManager");
const { generateJson } = require("../services/aiJson");
const UserActivity = require("../models/UserActivity");
const { quoteCharge, applyCharge, refundCharge } = require("../services/creditService");
const { recordEvidence } = require("../services/evidenceService");

// POST /api/interview/:id/generate-feedback — AI-generate feedback from transcript
exports.generateFeedback = async (req, res) => {
  try {
    const { transcript } = req.body;

    if (!transcript || !Array.isArray(transcript) || transcript.length === 0) {
      return res.status(400).json({ error: "Transcript is required" });
    }

    const interview = await Interview.findOne({
      _id: req.params.id,
      clerkId: req.clerkId,
    });

    if (!interview) {
      return res.status(404).json({ error: "Interview not found" });
    }

    // Already has feedback — return it
    if (interview.status === "completed" && interview.feedback) {
      return res.json({ success: true, feedback: interview.feedback });
    }

    if (!hasKeys()) {
      return res.status(500).json({ error: "Gemini API key not configured" });
    }

    // Format transcript for the prompt
    const formattedTranscript = transcript
      .map(
        (t) =>
          `${t.role === "assistant" ? "Interviewer" : "Candidate"}: ${t.content}`,
      )
      .join("\n");


    const prompt = `You are an expert interview evaluator. Analyze the following interview transcript for a ${interview.seniority} ${interview.role} position (${interview.category} interview${interview.topic ? `, topic: ${interview.topic}` : ""}).

TRANSCRIPT:
${formattedTranscript}

Evaluate the candidate and respond ONLY with valid JSON (no markdown, no code fences):
{
  "communication_score": <number 1-10>,
  "technical_score": <number 1-10>,
  "strengths": [<list of 2-4 specific strengths>],
  "weaknesses": [<list of 2-4 specific areas for improvement>],
  "improvement_plan": "<2-3 sentence actionable plan>",
  "hiring_recommendation": "<one of: Strong Hire, Hire, Lean Hire, Lean No Hire, No Hire>"
}`;

    let feedbackData;
    try {
      // Retries and backup models: Gemini often answers "high demand"
      feedbackData = await generateJson(prompt);
    } catch (aiError) {
      console.error("[Generate Feedback] AI error:", aiError.message);
      return res.status(503).json({ error: "The AI evaluator is busy right now. Please try again in a minute." });
    }

    // Save to database
    interview.feedback = {
      communication_score: feedbackData.communication_score ?? 5,
      technical_score: feedbackData.technical_score ?? 5,
      strengths: feedbackData.strengths ?? [],
      weaknesses: feedbackData.weaknesses ?? [],
      improvement_plan: feedbackData.improvement_plan ?? "",
      hiring_recommendation:
        feedbackData.hiring_recommendation ?? "Assessment Complete",
    };
    interview.transcript = transcript.map((t) => ({
      role: t.role,
      content: t.content,
      timestamp: t.timestamp || new Date(),
    }));
    interview.status = "completed";
    await interview.save();

    // Scores are 1-10; evidence uses 0-100
    const technical = Number(interview.feedback.technical_score) || 0;
    const communication = Number(interview.feedback.communication_score) || 0;
    recordEvidence({
      clerkId: req.clerkId,
      type: "interview_completed",
      topic: interview.role,
      score: Math.round(((technical + communication) / 2) * 10),
      refId: String(interview._id),
      meta: {
        technical,
        communication,
        category: interview.category,
        weaknesses: (interview.feedback.weaknesses || []).slice(0, 4),
      },
    }).catch((err) => console.error("Evidence log error:", err.message));

    res.json({ success: true, feedback: interview.feedback });
  } catch (error) {
    console.error("[Generate Feedback] Error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// GET /api/interview — List all interviews for current user
exports.listInterviews = async (req, res) => {
  try {
    const interviews = await Interview.find({ clerkId: req.clerkId })
      .sort({ createdAt: -1 })
      .select("_id role seniority topic category status feedback createdAt")
      .lean();

    res.json({ success: true, interviews });
  } catch (error) {
    console.error("Interview list error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// POST /api/interview — Create a new interview session
exports.createInterview = async (req, res) => {
  try {
    const { role, seniority, topic, category, vapiCallId } = req.body;

    if (!role || !seniority || !category) {
      return res
        .status(400)
        .json({ error: "role, seniority, and category are required" });
    }

    // --- Credit enforcement (server-side) ---
    const Candidate = require("../models/Candidate");
    const candidate = await Candidate.findById(req.user._id);
    if (!candidate) {
      return res.status(404).json({ error: "Candidate not found" });
    }

    const INTERVIEW_COST = 10;
    // First interview is free; later ones cost credits
    const quote = quoteCharge(candidate, { freeFlag: "freeInterviewUsed", cost: INTERVIEW_COST });
    const charged = quote.ok ? await applyCharge(candidate._id, quote) : null;
    if (!charged) {
      return res.status(402).json({
        error: "Insufficient credits for AI interview",
        creditsRequired: INTERVIEW_COST,
        creditsAvailable: candidate.credits,
        freeUsed: true,
      });
    }
    const creditCharged = quote.cost;
    // --- End credit enforcement ---

    let interview;
    try {
      interview = await Interview.create({
        clerkId: req.clerkId,
        role,
        seniority,
        topic: topic || "General Industry Standards",
        category,
        vapiCallId: vapiCallId || undefined,
        transcript: [],
        status: "pending",
      });
    } catch (createError) {
      await refundCharge(candidate._id, quote);
      throw createError;
    }

    // Log activity for dashboard
    UserActivity.create({
      candidate: req.user._id,
      type: 'interview_taken',
      metadata: { title: 'Interview Started', subtitle: `${seniority} ${role} — ${category} interview.` }
    }).catch(err => console.error('Activity log error:', err));

    res.json({
      success: true,
      interviewId: interview._id,
      creditCharged,
      creditsRemaining: charged.credits,
    });
  } catch (error) {
    console.error("Interview create error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// GET /api/interview/:id — Get a single interview
exports.getInterview = async (req, res) => {
  try {
    const interview = await Interview.findOne({
      _id: req.params.id,
      clerkId: req.clerkId,
    }).lean();

    if (!interview) {
      return res.status(404).json({ error: "Interview not found" });
    }

    res.json({ success: true, interview });
  } catch (error) {
    console.error("Interview fetch error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// PATCH /api/interview/:id — Update interview (e.g., link vapiCallId)
exports.updateInterview = async (req, res) => {
  try {
    const updateData = {};
    if (req.body.vapiCallId) updateData.vapiCallId = req.body.vapiCallId;

    const interview = await Interview.findOneAndUpdate(
      { _id: req.params.id, clerkId: req.clerkId },
      updateData,
      { new: true },
    );

    if (!interview) {
      return res.status(404).json({ error: "Interview not found" });
    }

    res.json({ success: true, interview });
  } catch (error) {
    console.error("Interview update error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// DELETE /api/interview/:id — Delete an interview
exports.deleteInterview = async (req, res) => {
  try {
    const interview = await Interview.findOneAndDelete({
      _id: req.params.id,
      clerkId: req.clerkId,
    });

    if (!interview) {
      return res.status(404).json({ error: "Interview not found" });
    }

    res.json({ success: true });
  } catch (error) {
    console.error("Interview delete error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// POST /api/interview/feedback — Vapi webhook (NO AUTH — called by Vapi servers)
exports.submitFeedback = async (req, res) => {
  try {
    const body = req.body;

    const message = body.message;
    if (!message) {
      return res.status(400).json({ error: "No message in payload" });
    }

    const call = message.call;
    const vapiCallId = call?.id;

    // Extract the tool call
    const toolCalls = message.toolCallList || message.toolCalls || [];
    const feedbackCall = toolCalls.find(
      (tc) =>
        tc.function?.name === "submit_interview_feedback" ||
        tc.function?.name === "submitInterviewFeedback",
    );

    if (!feedbackCall) {
      return res.json({
        results: toolCalls.map((tc) => ({
          toolCallId: tc.id,
          result: "Tool not handled by this endpoint.",
        })),
      });
    }

    // Parse feedback arguments
    let feedbackData;
    try {
      feedbackData =
        typeof feedbackCall.function.arguments === "string"
          ? JSON.parse(feedbackCall.function.arguments)
          : feedbackCall.function.arguments;
    } catch {
      feedbackData = feedbackCall.function.arguments;
    }

    // Save to MongoDB if we can match by vapiCallId
    if (vapiCallId) {
      const updated = await Interview.findOneAndUpdate(
        { vapiCallId },
        {
          feedback: {
            communication_score: feedbackData.communication_score ?? 0,
            technical_score: feedbackData.technical_score ?? 0,
            strengths: feedbackData.strengths ?? [],
            weaknesses: feedbackData.weaknesses ?? [],
            improvement_plan: feedbackData.improvement_plan ?? "",
            hiring_recommendation: feedbackData.hiring_recommendation ?? "",
          },
          status: "completed",
        },
        { new: true },
      );

      if (updated) {
        // Interview updated successfully
      } else {
        console.warn(
          "[Vapi Feedback Webhook] No interview found for vapiCallId:",
          vapiCallId,
        );
      }
    }

    // Return the expected Vapi response format
    res.json({
      results: [
        {
          toolCallId: feedbackCall.id,
          result:
            "Feedback submitted successfully. Thank the candidate and end the interview.",
        },
      ],
    });
  } catch (error) {
    console.error("[Vapi Feedback Webhook] Error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};
