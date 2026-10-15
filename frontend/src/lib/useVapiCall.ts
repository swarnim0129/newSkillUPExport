'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Vapi from '@vapi-ai/web';

export type CallState = 'idle' | 'connecting' | 'active' | 'ending';
export interface CallLine { role: 'user' | 'assistant'; text: string; final: boolean }

type StartAssistant = Parameters<Vapi['start']>[0];

export const VAPI_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPI_PUBLIC_KEY || '';

// Indian English neural voices; the student picks one for Future Self
export const VOICES = {
    companion: 'en-IN-NeerjaNeural',
    one: 'en-IN-NeerjaNeural',
    two: 'en-IN-PrabhatNeural',
};

/** A Vapi assistant built on the fly from a system prompt our backend wrote. */
export function assistantFor({ name, systemPrompt, firstMessage, voiceId }: { name: string; systemPrompt: string; firstMessage: string; voiceId: string }): StartAssistant {
    return {
        name,
        firstMessage,
        model: {
            provider: 'openai',
            model: 'gpt-4o-mini',
            temperature: 0.6,
            messages: [{ role: 'system', content: systemPrompt }],
        },
        voice: { provider: 'azure', voiceId },
        transcriber: { provider: 'deepgram', model: 'nova-2', language: 'en-IN' },
        // Keeps a forgotten call from running up minutes
        maxDurationSeconds: 600,
        silenceTimeoutSeconds: 45,
    } as StartAssistant;
}

/**
 * Run one Vapi call in the browser and keep a live transcript. `onEnd` gets the
 * final transcript and how long the call lasted.
 */
export function useVapiCall(onEnd?: (lines: CallLine[], seconds: number) => void) {
    const vapiRef = useRef<Vapi | null>(null);
    const startedAt = useRef<number>(0);
    const linesRef = useRef<CallLine[]>([]);
    const onEndRef = useRef(onEnd);
    const [state, setState] = useState<CallState>('idle');
    const [speaking, setSpeaking] = useState(false);
    const [volume, setVolume] = useState(0);
    const [lines, setLines] = useState<CallLine[]>([]);
    const [error, setError] = useState('');

    useEffect(() => { onEndRef.current = onEnd; }, [onEnd]);

    useEffect(() => {
        if (!VAPI_PUBLIC_KEY) return;
        const vapi = new Vapi(VAPI_PUBLIC_KEY);
        vapiRef.current = vapi;
        vapi.on('call-start', () => { startedAt.current = Date.now(); setState('active'); });
        vapi.on('speech-start', () => setSpeaking(true));
        vapi.on('speech-end', () => setSpeaking(false));
        vapi.on('volume-level', (v: number) => setVolume(v));
        vapi.on('call-end', () => {
            setState('idle');
            setSpeaking(false);
            setVolume(0);
            const finalLines = linesRef.current.filter((l) => l.text.trim());
            const seconds = startedAt.current ? Math.round((Date.now() - startedAt.current) / 1000) : 0;
            onEndRef.current?.(finalLines, seconds);
        });
        vapi.on('error', (e: unknown) => {
            const msg = (e as { error?: { message?: string }; message?: string })?.error?.message || (e as { message?: string })?.message || 'The call failed.';
            setError(/permission|NotAllowed/i.test(String(msg)) ? 'Microphone access is blocked. Allow it in the address bar and try again.' : `Voice call error: ${msg}`);
            setState('idle');
        });
        vapi.on('message', (m: { type?: string; role?: string; transcriptType?: string; transcript?: string }) => {
            if (m.type !== 'transcript' || !m.transcript) return;
            const role: CallLine['role'] = m.role === 'assistant' ? 'assistant' : 'user';
            const final = m.transcriptType === 'final';
            const next = [...linesRef.current];
            const last = next[next.length - 1];
            // A partial line is replaced as it grows; a final line closes it
            if (last && last.role === role && !last.final) next[next.length - 1] = { role, text: m.transcript, final };
            else next.push({ role, text: m.transcript, final });
            linesRef.current = next;
            setLines(next);
        });
        return () => { vapi.stop(); vapi.removeAllListeners(); vapiRef.current = null; };
    }, []);

    const start = useCallback(async (assistant: StartAssistant) => {
        if (!vapiRef.current) { setError('Voice calls are not set up (missing Vapi key).'); return; }
        setError('');
        linesRef.current = [];
        setLines([]);
        setState('connecting');
        try {
            await vapiRef.current.start(assistant);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Could not start the call.');
            setState('idle');
        }
    }, []);

    const stop = useCallback(() => {
        if (!vapiRef.current) return;
        setState('ending');
        vapiRef.current.stop();
    }, []);

    return { available: !!VAPI_PUBLIC_KEY, state, speaking, volume, lines, error, setError, start, stop };
}
