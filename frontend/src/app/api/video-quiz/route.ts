import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "@clerk/nextjs/server";
import { withGeminiFallback } from "@/lib/gemini";

export async function POST(request: NextRequest) {
  try {
    // This route spends the server's AI quota, so only signed-in users may call it
    const { userId } = getAuth(request);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { videoTitle, topic, overallSummary, chapters } =
      await request.json();

    if (!overallSummary && (!chapters || chapters.length === 0)) {
      return NextResponse.json(
        { error: "No transcript data provided" },
        { status: 400 },
      );
    }


    const chaptersText = (chapters || [])
      .map(
        (t: any, i: number) =>
          `Chapter ${i + 1}: "${t.title}"\n  Summary: ${t.summary}\n  Keywords: ${(t.keywords || []).join(", ")}`,
      )
      .join("\n\n");

    const prompt = `You are an expert educator. Based on the following video content about "${topic}", generate exactly 5 multiple-choice quiz questions to test comprehension.

Video Title: ${videoTitle || topic}
Overall Summary: ${overallSummary || ""}

Chapters Covered:
${chaptersText || "No chapters provided."}

Rules:
- Each question must have exactly 4 options labeled A, B, C, D
- Exactly one option must be correct
- Questions must be specific to the content above (not generic)
- Keep questions clear and concise
- The "correct" field is a 0-indexed integer (0=A, 1=B, 2=C, 3=D)

Return ONLY valid JSON — no markdown, no explanation:
{
  "questions": [
    {
      "question": "...",
      "options": ["option A", "option B", "option C", "option D"],
      "correct": 0
    }
  ]
}`;

    const text = (await withGeminiFallback((model) => model.generateContent(prompt).then((r) => r.response.text()))).trim();

    // Strip possible markdown fences
    const jsonText = text
      .replace(/^```(?:json)?\n?/m, "")
      .replace(/```$/m, "")
      .trim();
    const parsed = JSON.parse(jsonText);

    return NextResponse.json(parsed);
  } catch (error: any) {
    console.error("[video-quiz] Error:", error);
    return NextResponse.json(
      { error: "Failed to generate quiz", details: error.message },
      { status: 500 },
    );
  }
}
