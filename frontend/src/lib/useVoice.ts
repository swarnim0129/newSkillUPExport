'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

// Minimal typings for the Web Speech API (not in the TypeScript DOM library)
interface RecognitionResult { isFinal: boolean; 0: { transcript: string } }
interface RecognitionEvent { resultIndex: number; results: ArrayLike<RecognitionResult> }
interface Recognition {
    lang: string;
    interimResults: boolean;
    continuous: boolean;
    onresult: ((e: RecognitionEvent) => void) | null;
    onerror: ((e: { error: string }) => void) | null;
    onend: (() => void) | null;
    start: () => void;
    stop: () => void;
    abort: () => void;
}
type RecognitionCtor = new () => Recognition;

export type VoiceState = 'idle' | 'listening' | 'thinking' | 'speaking';

function recognitionCtor(): RecognitionCtor | null {
    if (typeof window === 'undefined') return null;
    const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
    return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

/** Pick a natural English voice, preferring Indian then British English. */
function pickVoice(): SpeechSynthesisVoice | null {
    if (typeof window === 'undefined' || !window.speechSynthesis) return null;
    const voices = window.speechSynthesis.getVoices();
    return (
        voices.find((v) => v.lang === 'en-IN' && /female|google|natural/i.test(v.name)) ||
        voices.find((v) => v.lang === 'en-IN') ||
        voices.find((v) => /en-GB/.test(v.lang) && /google|natural/i.test(v.name)) ||
        voices.find((v) => /^en/.test(v.lang) && /google|natural|samantha/i.test(v.name)) ||
        voices.find((v) => /^en/.test(v.lang)) ||
        null
    );
}

/**
 * Talk and listen in the browser. `onFinal` gets the recognised sentence; the
 * caller sends it and then calls `speak` with the reply.
 */
export function useVoice({ onFinal, pitch = 1, rate = 1.02 }: { onFinal: (text: string) => void; pitch?: number; rate?: number }) {
    const [state, setState] = useState<VoiceState>('idle');
    const [interim, setInterim] = useState('');
    const [error, setError] = useState('');
    const [supported, setSupported] = useState({ listen: false, speak: false });
    const recRef = useRef<Recognition | null>(null);
    const finalRef = useRef('');
    const onFinalRef = useRef(onFinal);
    useEffect(() => { onFinalRef.current = onFinal; }, [onFinal]);

    useEffect(() => {
        const ok = { listen: !!recognitionCtor(), speak: typeof window !== 'undefined' && 'speechSynthesis' in window };
        void Promise.resolve().then(() => setSupported(ok));
        // Voices load asynchronously in Chrome
        if (ok.speak) window.speechSynthesis.getVoices();
        return () => {
            recRef.current?.abort();
            if (ok.speak) window.speechSynthesis.cancel();
        };
    }, []);

    const listen = useCallback(() => {
        const Ctor = recognitionCtor();
        if (!Ctor) { setError('Voice input works in Chrome and Edge. You can still type.'); return; }
        if (typeof window !== 'undefined' && window.speechSynthesis) window.speechSynthesis.cancel();
        setError('');
        setInterim('');
        finalRef.current = '';
        const rec = new Ctor();
        rec.lang = 'en-IN';
        rec.interimResults = true;
        rec.continuous = false;
        rec.onresult = (e) => {
            let text = '';
            for (let i = 0; i < e.results.length; i++) text += e.results[i][0].transcript;
            setInterim(text);
            const last = e.results[e.results.length - 1];
            if (last && last.isFinal) finalRef.current = text;
        };
        rec.onerror = (e) => {
            if (e.error === 'not-allowed' || e.error === 'service-not-allowed') setError('Microphone access is blocked. Allow it in the address bar and try again.');
            else if (e.error === 'no-speech') setError('I did not hear anything. Tap and speak again.');
            else if (e.error !== 'aborted') setError(`Voice error: ${e.error}`);
        };
        rec.onend = () => {
            recRef.current = null;
            const text = finalRef.current.trim();
            if (text) {
                setState('thinking');
                onFinalRef.current(text);
            } else {
                setState('idle');
            }
        };
        recRef.current = rec;
        setState('listening');
        rec.start();
    }, []);

    const stop = useCallback(() => {
        recRef.current?.stop();
        if (typeof window !== 'undefined' && window.speechSynthesis) window.speechSynthesis.cancel();
        setState((s) => (s === 'speaking' ? 'idle' : s));
    }, []);

    const speak = useCallback((text: string, after?: () => void) => {
        if (!text || typeof window === 'undefined' || !window.speechSynthesis) { setState('idle'); after?.(); return; }
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);
        const voice = pickVoice();
        if (voice) u.voice = voice;
        u.lang = voice ? voice.lang : 'en-IN';
        u.rate = rate;
        u.pitch = pitch;
        u.onend = () => { setState('idle'); after?.(); };
        u.onerror = () => { setState('idle'); };
        setState('speaking');
        window.speechSynthesis.speak(u);
    }, [pitch, rate]);

    const settle = useCallback(() => setState('idle'), []);

    return { state, interim, error, supported, listen, stop, speak, settle, setError };
}
