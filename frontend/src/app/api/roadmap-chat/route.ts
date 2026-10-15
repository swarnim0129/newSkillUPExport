import { withGeminiFallback } from '@/lib/gemini';
import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from '@clerk/nextjs/server';

export async function POST(req: NextRequest) {
    try {
        // These routes spend the server's AI quota, so only signed-in users may call them
        const { userId } = getAuth(req);
        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { message, context, history } = await req.json();


        const systemPrompt = `You are a helpful learning assistant. The user is reading content about "${context}". 
Help them understand the material, answer their questions, and explain concepts clearly. 
Keep responses concise but informative. Use markdown formatting when helpful.`;

        const chatHistory = (history || []).map((msg: any) => ({
            role: msg.role === 'user' ? 'user' : 'model',
            parts: [{ text: msg.content }],
        }));

        const response = await withGeminiFallback((model) => model.startChat({
            history: [
                { role: 'user', parts: [{ text: systemPrompt }] },
                { role: 'model', parts: [{ text: 'I understand! I\'m ready to help you learn. Ask me anything about the content you\'re reading.' }] },
                ...chatHistory,
            ],
        }).sendMessage(message).then((r) => r.response.text()));

        return NextResponse.json({ reply: response });
    } catch (error: any) {
        console.error('Chat API error:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to generate response' },
            { status: 500 }
        );
    }
}
