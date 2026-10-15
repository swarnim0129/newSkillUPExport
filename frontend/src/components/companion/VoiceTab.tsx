'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Headphones, Keyboard, Send } from 'lucide-react';
import { errorMessage, sendMessage, type CompanionMessage, type MemoryFact } from '@/lib/journeyApi';
import { getCompanionVoice, saveCompanionVoice } from '@/lib/growApi';
import { assistantFor, useVapiCall, VAPI_PUBLIC_KEY, VOICES, type CallLine } from '@/lib/useVapiCall';
import { useVoice } from '@/lib/useVoice';
import MessageCard, { speechOf } from './MessageCard';
import VoiceOrb from './VoiceOrb';
import { card, ErrorNote, focusRing, input, primaryButton } from '@/components/classroom/ui';

/**
 * Voice mode. With a Vapi key: a real phone-style call (natural voice, can be
 * interrupted, any browser), summarised into the chat afterwards. Without one,
 * or if the student prefers: the browser's own speech, one turn at a time.
 */
export default function VoiceTab(props: { getToken: () => Promise<string | null>; onMessages: (messages: CompanionMessage[], memory: MemoryFact[]) => void }) {
    const [mode, setMode] = useState<'call' | 'browser'>(VAPI_PUBLIC_KEY ? 'call' : 'browser');
    return (
        <div className="space-y-3">
            {VAPI_PUBLIC_KEY && (
                <div className="flex justify-end">
                    <button className={`text-xs font-semibold text-blue-700 hover:underline dark:text-blue-400 ${focusRing}`} onClick={() => setMode((m) => (m === 'call' ? 'browser' : 'call'))}>
                        {mode === 'call' ? 'Use push-to-talk instead' : 'Switch to a live voice call'}
                    </button>
                </div>
            )}
            {mode === 'call' ? <CallVoice {...props} /> : <BrowserVoice {...props} />}
        </div>
    );
}

function CallVoice({
    getToken,
    onMessages,
}: {
    getToken: () => Promise<string | null>;
    onMessages: (messages: CompanionMessage[], memory: MemoryFact[]) => void;
}) {
    const [saving, setSaving] = useState(false);
    const [reply, setReply] = useState<CompanionMessage | null>(null);
    const [failure, setFailure] = useState('');
    const endRef = useRef<HTMLDivElement>(null);

    const onEnd = useCallback(async (lines: CallLine[], seconds: number) => {
        if (!lines.some((l) => l.role === 'user')) return;
        setSaving(true);
        try {
            const r = await saveCompanionVoice(await getToken(), lines.map((l) => ({ role: l.role, text: l.text })), seconds);
            if (r.message) {
                setReply(r.message);
                onMessages([r.message], r.memory || []);
            }
        } catch (err) {
            setFailure(errorMessage(err, 'The call ended but could not be saved.'));
        } finally {
            setSaving(false);
        }
    }, [getToken, onMessages]);

    const call = useVapiCall(onEnd);
    useEffect(() => { endRef.current?.scrollIntoView({ block: 'nearest' }); }, [call.lines]);

    const tap = async () => {
        if (call.state === 'active' || call.state === 'connecting') { call.stop(); return; }
        setFailure('');
        setReply(null);
        try {
            const setup = await getCompanionVoice(await getToken());
            await call.start(assistantFor({ name: 'SkillUp companion', systemPrompt: setup.systemPrompt, firstMessage: setup.firstMessage, voiceId: VOICES.companion }));
        } catch (err) {
            setFailure(errorMessage(err, 'Could not start the call.'));
        }
    };

    const orbState = call.state === 'connecting' || call.state === 'ending' || saving ? 'thinking' : call.state === 'active' ? (call.speaking ? 'speaking' : 'listening') : 'idle';

    return (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
            <section className={`${card} flex flex-col items-center justify-center gap-5 p-8 text-center`} aria-label="Voice call">
                <VoiceOrb
                    state={orbState}
                    onTap={tap}
                    level={call.speaking ? call.volume : 0}
                    labels={{
                        idle: 'Tap to call your companion',
                        thinking: saving ? 'Saving the call to your chat…' : 'Connecting…',
                        listening: 'Listening… tap to hang up',
                        speaking: 'Speaking… tap to hang up',
                    }}
                />
                <p className="max-w-sm text-xs text-slate-600 dark:text-slate-400">
                    A real-time call: talk naturally and interrupt any time. After you hang up, the call is summarised into your chat, and any plan changes you asked for are made.
                </p>
                <ErrorNote text={call.error || failure} />
            </section>

            <section className="space-y-3" aria-label="Call" aria-live="polite">
                {call.state !== 'idle' || (call.lines.length > 0 && !reply) ? (
                    <div className={`${card} max-h-[28rem] space-y-2 overflow-y-auto p-4`}>
                        {call.lines.length === 0 && <p className="text-sm text-slate-500 dark:text-slate-400">Say hello…</p>}
                        {call.lines.map((l, i) => (
                            <p key={i} className={`flex ${l.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                <span className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${l.role === 'user' ? 'bg-blue-600 text-white' : 'border border-white/70 bg-white/70 text-slate-900 dark:border-white/5 dark:bg-white/5 dark:text-white'} ${l.final ? '' : 'opacity-70'}`}>{l.text}</span>
                            </p>
                        ))}
                        <div ref={endRef} />
                    </div>
                ) : reply ? (
                    <MessageCard message={reply} />
                ) : (
                    <div className={`${card} flex h-full min-h-64 flex-col items-center justify-center p-8 text-center`}>
                        <p className="text-base font-semibold text-slate-900 dark:text-white">Call your companion</p>
                        <ul className="mt-3 space-y-1.5 text-sm text-slate-600 dark:text-slate-400">
                            <li>“What should I focus on this week?”</li>
                            <li>“I have exams from Monday, adjust my plan.”</li>
                            <li>“How far am I from being placement ready?”</li>
                        </ul>
                    </div>
                )}
            </section>
        </div>
    );
}

function BrowserVoice({
    getToken,
    onMessages,
}: {
    getToken: () => Promise<string | null>;
    onMessages: (messages: CompanionMessage[], memory: MemoryFact[]) => void;
}) {
    const [said, setSaid] = useState('');
    const [reply, setReply] = useState<CompanionMessage | null>(null);
    const [handsFree, setHandsFree] = useState(false);
    const [typed, setTyped] = useState('');
    const [sendError, setSendError] = useState('');
    const handsFreeRef = useRef(handsFree);
    useEffect(() => { handsFreeRef.current = handsFree; }, [handsFree]);
    const listenRef = useRef<() => void>(() => undefined);

    const ask = useCallback(async (text: string, speakFn: (t: string, after?: () => void) => void, settle: () => void) => {
        setSaid(text);
        setSendError('');
        try {
            const data = await sendMessage(await getToken(), text);
            onMessages(data.messages, data.memory || []);
            const answer = data.messages.find((m) => m.role === 'companion') || null;
            setReply(answer);
            if (answer) speakFn(speechOf(answer), () => { if (handsFreeRef.current) listenRef.current(); });
            else settle();
        } catch (err) {
            setSendError(errorMessage(err, 'Your companion could not answer. Try again.'));
            settle();
        }
    }, [getToken, onMessages]);

    const voice = useVoice({ onFinal: (text) => ask(text, voice.speak, voice.settle) });
    useEffect(() => { listenRef.current = voice.listen; }, [voice.listen]);

    const tap = () => {
        if (voice.state === 'listening' || voice.state === 'speaking') voice.stop();
        else voice.listen();
    };

    return (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
            <section className={`${card} flex flex-col items-center justify-center gap-5 p-8 text-center`} aria-label="Voice conversation">
                <VoiceOrb state={voice.state} onTap={tap} disabled={!voice.supported.listen} />
                <div className="min-h-[3rem] max-w-md">
                    {voice.state === 'listening' && voice.interim && <p className="text-lg font-medium text-slate-900 dark:text-white">“{voice.interim}”</p>}
                    {voice.state !== 'listening' && said && <p className="text-sm text-slate-600 dark:text-slate-400">You said: “{said}”</p>}
                </div>
                <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                    <input type="checkbox" className="h-5 w-5 accent-blue-600" checked={handsFree} onChange={(e) => setHandsFree(e.target.checked)} />
                    <Headphones className="h-4 w-4" aria-hidden="true" /> Hands-free: listen again after each answer
                </label>
                {!voice.supported.listen && (
                    <p className="rounded-xl bg-amber-50 px-4 py-2 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
                        Voice input needs Chrome or Edge. Type below and answers are still read aloud.
                    </p>
                )}
                <ErrorNote text={voice.error || sendError} />
                <form
                    className="flex w-full max-w-md items-center gap-2"
                    onSubmit={(e) => { e.preventDefault(); if (typed.trim()) { const t = typed.trim(); setTyped(''); voice.setError(''); ask(t, voice.speak, voice.settle); } }}
                >
                    <label htmlFor="voice-type" className="sr-only">Type instead</label>
                    <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center text-slate-400"><Keyboard className="h-5 w-5" aria-hidden="true" /></span>
                    <input id="voice-type" className={input} value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Or type here" maxLength={2000} />
                    <button type="submit" className={primaryButton} disabled={!typed.trim() || voice.state === 'thinking'} aria-label="Send"><Send className="h-4 w-4" aria-hidden="true" /></button>
                </form>
            </section>

            <section className="space-y-3" aria-label="Latest answer" aria-live="polite">
                {reply ? (
                    <MessageCard message={reply} />
                ) : (
                    <div className={`${card} flex h-full min-h-64 flex-col items-center justify-center p-8 text-center`}>
                        <p className="text-base font-semibold text-slate-900 dark:text-white">Ask anything out loud</p>
                        <ul className="mt-3 space-y-1.5 text-sm text-slate-600 dark:text-slate-400">
                            <li>“What should I focus on this week?”</li>
                            <li>“I have exams from Monday, adjust my plan.”</li>
                            <li>“How far am I from being placement ready?”</li>
                        </ul>
                    </div>
                )}
            </section>
        </div>
    );
}
