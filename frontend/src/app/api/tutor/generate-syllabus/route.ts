import { NextResponse } from "next/server";
import { withGeminiFallback } from "@/lib/gemini";
import { connectDB, TutorSubject, getClerkId } from "../db";

export async function POST(request: Request) {
  try {
    // Auth
    const clerkId = await getClerkId(request);
    if (!clerkId) {
      return NextResponse.json(
        { success: false, message: "Unauthorized" },
        { status: 401 },
      );
    }

    const { topic } = await request.json();
    if (!topic || typeof topic !== "string" || topic.trim().length === 0) {
      return NextResponse.json(
        { success: false, message: "Topic is required" },
        { status: 400 },
      );
    }

    const trimmedTopic = topic.trim();

    // Generate syllabus via Gemini

    const prompt = `You are a curriculum designer. Given a topic, generate a structured syllabus with exactly 8 to 10 chapters, ordered from beginner to advanced concepts.

Each chapter must have:
- number: sequential integer starting from 1
- title: clear, concise chapter title (max 8 words)
- description: 1-2 sentence summary of what will be covered in that chapter

Also provide:
- name: the display name for the subject
- slug: URL-safe lowercase version using hyphens (e.g., "data-structures", "react", "machine-learning")
- icon: one of these exact icon keys that best fits the subject: "code", "terminal", "database", "network", "blocks", "brain", "flask", "calculator", "globe", "cpu", "palette", "pen", "book", "layers", "lock", "bar-chart", "zap"

Return ONLY valid JSON in this exact format, no markdown code fences:
{
  "name": "...",
  "slug": "...",
  "icon": "...",
  "chapters": [
    { "number": 1, "title": "...", "description": "..." }
  ]
}

Topic: ${trimmedTopic}`;

    const responseText = await withGeminiFallback((model) => model.generateContent(prompt).then((r) => r.response.text()));

    // Parse JSON from response (strip markdown fences if present)
    let parsed;
    try {
      const jsonStr = responseText
        .replace(/```json\s*/gi, "")
        .replace(/```\s*/g, "")
        .trim();
      parsed = JSON.parse(jsonStr);
    } catch {
      return NextResponse.json(
        {
          success: false,
          message: "Failed to parse Gemini response",
          raw: responseText,
        },
        { status: 500 },
      );
    }

    // Validate structure
    if (!parsed.name || !parsed.slug || !Array.isArray(parsed.chapters)) {
      return NextResponse.json(
        { success: false, message: "Invalid syllabus structure from AI" },
        { status: 500 },
      );
    }

    // Connect to MongoDB and save
    await connectDB();

    // Check if subject already exists for this user
    const existing = await TutorSubject.findOne({
      clerkId,
      slug: parsed.slug,
    });

    if (existing) {
      return NextResponse.json(
        {
          success: true,
          subject: existing,
          message: "Subject already exists",
          existing: true,
        },
        { status: 200 },
      );
    }

    const subject = await TutorSubject.create({
      clerkId,
      name: parsed.name,
      slug: parsed.slug,
      icon: parsed.icon || "book",
      chapters: parsed.chapters.map((ch: any) => ({
        number: ch.number,
        title: ch.title,
        description: ch.description,
        status: "not_started",
      })),
    });

    return NextResponse.json({ success: true, subject }, { status: 201 });
  } catch (error: any) {
    console.error("[generate-syllabus] Error:", error);
    return NextResponse.json(
      { success: false, message: error.message || "Internal server error" },
      { status: 500 },
    );
  }
}
