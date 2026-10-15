import { withGeminiFallback } from '@/lib/gemini';
import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from '@clerk/nextjs/server';

interface TopicSection {
    title: string;
    start_ms: number;
    end_ms: number;
    summary: string;
    keywords: string[];
}

export async function POST(req: NextRequest) {
    try {
        // These routes spend the server's AI quota, so only signed-in users may call them
        const { userId } = getAuth(req);
        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json();
        const { message, videoTitle, topic, overallSummary, history } = body;
        // A video without a transcript has no chapters
        const chapters: TopicSection[] = Array.isArray(body.chapters) ? body.chapters : [];


        // Build chapters context for the AI
        const chaptersContext = chapters
            .map((ch, i) => {
                const startMin = Math.floor(ch.start_ms / 60000);
                const startSec = Math.floor((ch.start_ms % 60000) / 1000);
                const endMin = Math.floor(ch.end_ms / 60000);
                const endSec = Math.floor((ch.end_ms % 60000) / 1000);
                return `Chapter ${i + 1}: "${ch.title}" (${startMin}:${String(startSec).padStart(2, '0')} - ${endMin}:${String(endSec).padStart(2, '0')})
  Summary: ${ch.summary}
  Keywords: ${(ch.keywords || []).join(', ')}`;
            })
            .join('\n\n');

        const systemPrompt = `You are a helpful AI video tutor. The user is watching a YouTube video titled "${videoTitle}" about "${topic}".

VIDEO SUMMARY: ${overallSummary}

VIDEO CHAPTERS:
${chaptersContext}

INSTRUCTIONS:
1. Answer user questions based on the video content and chapters above.
2. When the user asks about a specific topic or wants to find a particular part of the video, identify the relevant chapter and include a SEEK command in your response.
3. Format seek commands as: [SEEK:chapter_index] where chapter_index is 0-based.
4. For example, if the user asks "Where does it talk about Neural Networks?" and that's Chapter 3, include [SEEK:2] in your response.
5. You can reference timestamps naturally like "This is covered in Chapter 3 'Neural Networks' starting at 5:30".
6. Keep responses concise, informative, and helpful.
7. If the user asks to summarize, provide a clear summary of the video or specific chapters.
8. If asked about something not in the video, say so honestly.`;

        const chatHistory = (history || []).map((msg: any) => ({
            role: msg.role === 'user' ? 'user' : 'model',
            parts: [{ text: msg.content }],
        }));

        const response = await withGeminiFallback((model) => model.startChat({
            history: [
                { role: 'user', parts: [{ text: systemPrompt }] },
                {
                    role: 'model',
                    parts: [{
                        text: `I'm ready to help you learn from this video about "${topic}"! I have full context of all ${chapters.length} chapters. Ask me anything about the content, or tell me what topic you want to jump to and I'll navigate you there!`,
                    }],
                },
                ...chatHistory,
            ],
        }).sendMessage(message).then((r) => r.response.text()));

        // Parse out SEEK commands
        const seekMatch = response.match(/\[SEEK:(\d+)\]/);
        const seekToChapter = seekMatch ? parseInt(seekMatch[1], 10) : null;
        const cleanedResponse = response.replace(/\[SEEK:\d+\]/g, '').trim();

        return NextResponse.json({
            reply: cleanedResponse,
            seekToChapter,
        });
    } catch (error: any) {
        console.error('Video chat API error:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to generate response' },
            { status: 500 }
        );
    }
}
