import { NextResponse } from "next/server";
import { getClerkId } from "../db";
import { withGeminiFallback } from "@/lib/gemini";

// ─── POST /api/tutor/generate-quiz ────────────────────────────────────────────
// Generates 2-3 MCQ questions based on a chapter's title and description.
// Uses Gemini to create contextually relevant assessment questions.

export async function POST(request: Request) {
  try {
    const clerkId = await getClerkId(request);
    if (!clerkId) {
      return NextResponse.json(
        { success: false, message: "Unauthorized" },
        { status: 401 },
      );
    }

    const { chapterTitle, chapterDescription, subjectName } =
      await request.json();

    if (!chapterTitle || !subjectName) {
      return NextResponse.json(
        {
          success: false,
          message: "chapterTitle and subjectName are required",
        },
        { status: 400 },
      );
    }


    const prompt = `You are an expert educator creating a quick assessment quiz for a student who just completed a lesson.

Subject: ${subjectName}
Chapter: ${chapterTitle}
Chapter Description: ${chapterDescription || chapterTitle}

Generate exactly 3 multiple-choice questions (MCQs) to test the student's understanding of this chapter.

Rules:
- Each question should test a key concept from the chapter
- Provide exactly 4 options for each question (A, B, C, D)
- Only one option should be correct
- Make distractors plausible but clearly wrong to someone who studied the material
- Questions should range from basic recall to application level
- Keep questions concise and clear

Respond ONLY with a JSON array in this exact format (no markdown, no backticks):
[
  {
    "question": "What is...?",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "correctIndex": 0
  },
  {
    "question": "Which of the following...?",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "correctIndex": 2
  },
  {
    "question": "How does...?",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "correctIndex": 1
  }
]`;

    const responseText = (await withGeminiFallback((model) => model.generateContent(prompt).then((r) => r.response.text()))).trim();

    // Parse the JSON response — handle potential markdown wrapping
    let cleaned = responseText;
    if (cleaned.startsWith("```")) {
      cleaned = cleaned.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
    }

    const questions = JSON.parse(cleaned);

    // Validate structure
    if (!Array.isArray(questions) || questions.length === 0) {
      throw new Error("Invalid quiz format returned by AI");
    }

    for (const q of questions) {
      if (
        !q.question ||
        !Array.isArray(q.options) ||
        q.options.length !== 4 ||
        typeof q.correctIndex !== "number" ||
        q.correctIndex < 0 ||
        q.correctIndex > 3
      ) {
        throw new Error("Invalid question format");
      }
    }

    return NextResponse.json({
      success: true,
      questions,
    });
  } catch (error: any) {
    console.error("[generate-quiz] Error:", error);
    return NextResponse.json(
      { success: false, message: error.message || "Failed to generate quiz" },
      { status: 500 },
    );
  }
}
