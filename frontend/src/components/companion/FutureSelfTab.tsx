'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Hourglass, Keyboard, Send, Sparkles, TrendingUp } from 'lucide-react';
import { errorMessage, type CompanionMessage } from '@/lib/journeyApi';
import { askFutureSelf, getFutureVoice, type FutureSelfReply } from '@/lib/growApi';
import { assistantFor, useVapiCall, VAPI_PUBLIC_KEY, VOICES, type CallLine } from '@/lib/useVapiCall';
import { useVoice } from '@/lib/useVoice';
import MessageCard from './MessageCard';
import VoiceOrb from './VoiceOrb';
import { card, ErrorNote, focusRing, input, primaryButton } from '@/components/classroom/ui';

type Path = 'current' | 'improved';

const OPENERS = ['Did we make it?', 'What do you wish I had done this year?', 'What was the hardest part?'];

/**
 * Talk to yourself in final year. Two versions: the one who kept today's habits
 * and the one who made the change. Both speak from the student's own projection.
 */
export default function FutureSelfTab({ getToken, firstName }: { getToken: () => Promise<string | null>; firstName: string }) {
    const [path, setPath] = useState<Path>('current');
    const [turns, setTurns] = useState<{ role: 'user' | 'future'; text: string; reply?: FutureSelfReply; at: string }[]>([]);
    const [typed, setTyped] = useState('');
    const [error, setError] = useState('');
    const [preview, setPreview] = useState<FutureSelfReply['projection'] | null>(null);
    const [improved, setImproved] = useState<FutureSelfReply['improved'] | null>(null);
    const endRef = useRef<HTMLDivElement>(null);
    const turnsRef = useRef(turns);
    useEffect(() => { turnsRef.current = turns; }, [turns]);

    const ask = useCallback(async (text: string, speak: (t: string) => void, settle: () => void) => {
        setError('');
        const at = new Date().toISOString();
        setTurns((prev) => [...prev, { role: 'user', text, at }]);
        try {
            const r = await askFutureSelf(await getToken(), {
                message: text,
                path,
                history: turnsRef.current.map((t) => ({ role: t.role, text: t.text })),
            });
            setPreview(r.projection);
            setImproved(r.improved);
            setTurns((prev) => [...prev, { role: 'future', text: r.speech, reply: r, at: new Date().toISOString() }]);
            speak(r.speech);
        } catch (err) {
            setError(errorMessage(err, 'Your future self could not answer just now.'));
            settle();
        }
    }, [getToken, path]);

    // A slightly older-sounding voice for the future self
    const voice = useVoice({ onFinal: (text) => ask(text, voice.speak, voice.settle), pitch: 0.9, rate: 0.97 });

    // Live call through Vapi when it is configured: the call becomes part of the conversation
    const [voiceChoice, setVoiceChoice] = useState<'one' | 'two'>('one');
    const onCallEnd = useCallback((lines: CallLine[]) => {
        const at = new Date().toISOString();
        setTurns((prev) => [...prev, ...lines.map((l) => ({ role: (l.role === 'user' ? 'user' : 'future') as 'user' | 'future', text: l.text, at }))]);
    }, []);
    const call = useVapiCall(onCallEnd);
    const useCall = call.available;
    const startCall = async () => {
        if (call.state === 'active' || call.state === 'connecting') { call.stop(); return; }
        setError('');
        try {
            const setup = await getFutureVoice(await getToken(), path);
            setPreview(setup.projection);
            setImproved(setup.improved);
            await call.start(assistantFor({ name: 'Future self', systemPrompt: setup.systemPrompt, firstMessage: setup.firstMessage, voiceId: VOICES[voiceChoice] }));
        } catch (err) {
            setError(errorMessage(err, 'Could not start the call.'));
        }
    };
    const callOrb = call.state === 'connecting' || call.state === 'ending' ? 'thinking' : call.state === 'active' ? (call.speaking ? 'speaking' : 'listening') : 'idle';
    useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, [turns]);

    const switchPath = (next: Path) => {
        if (next === path) return;
        voice.stop();
        if (call.state !== 'idle') call.stop();
        setPath(next);
        setTurns([]);
    };

    const tone = path === 'improved' ? 'amber' : 'blue';
    return (
        <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Which future you">
                {([
                    { key: 'current', title: 'Me, if nothing changes', hint: 'Same hours, same habits as today', icon: Hourglass },
                    { key: 'improved', title: 'Me, if I change now', hint: improved ? `${improved.hoursPerWeek} hours a week and ${improved.dsaPerWeek} DSA problems a week` : 'A few more hours and steady DSA each week', icon: TrendingUp },
                ] as const).map((p) => (
                    <button
                        key={p.key}
                        role="radio"
                        aria-checked={path === p.key}
                        onClick={() => switchPath(p.key)}
                        className={`flex items-start gap-3 rounded-2xl border p-4 text-left transition-colors cursor-pointer ${focusRing} ${path === p.key ? (p.key === 'improved' ? 'border-amber-400 bg-amber-50/80 dark:bg-amber-500/10' : 'border-blue-400 bg-blue-50/80 dark:bg-blue-500/10') : 'border-white/70 bg-white/55 dark:border-white/5 dark:bg-white/[0.04]'}`}
                    >
                        <span className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl text-white ${p.key === 'improved' ? 'bg-amber-500' : 'bg-blue-600'}`}><p.icon className="h-5 w-5" aria-hidden="true" /></span>
                        <span>
                            <span className="block text-sm font-bold text-slate-900 dark:text-white">{p.title}</span>
                            <span className="block text-xs text-slate-600 dark:text-slate-400">{p.hint}</span>
                            {preview && path === p.key && (
                                <span className="mt-1 block text-xs font-semibold text-slate-800 dark:text-slate-200">
                                    Readiness at {preview.target.split('(')[0].trim()}: {p.key === 'improved' ? preview.scenario : preview.baseline}/100
                                </span>
                            )}
                        </span>
                    </button>
                ))}
            </div>

            <div className="grid gap-5 lg:grid-cols-[20rem_minmax(0,1fr)]">
                <section className={`${card} flex h-fit flex-col items-center gap-4 p-6 text-center`} aria-label="Talk to your future self">
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Final-year {firstName}</p>
                    {useCall ? (
                        <>
                            <VoiceOrb
                                state={callOrb}
                                tone={tone}
                                onTap={startCall}
                                level={call.speaking ? call.volume : 0}
                                labels={{ idle: 'Tap to call your future self', thinking: 'Connecting…', listening: 'Listening… tap to hang up', speaking: 'Speaking… tap to hang up' }}
                            />
                            <div className="flex gap-2" role="radiogroup" aria-label="Voice">
                                {(['one', 'two'] as const).map((v) => (
                                    <button key={v} role="radio" aria-checked={voiceChoice === v} disabled={call.state !== 'idle'} onClick={() => setVoiceChoice(v)}
                                        className={`min-h-9 rounded-full border px-3 text-xs font-semibold cursor-pointer ${focusRing} ${voiceChoice === v ? 'border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-slate-900' : 'border-slate-200 bg-white/70 text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-slate-200'}`}>
                                        Voice {v === 'one' ? 1 : 2}
                                    </button>
                                ))}
                            </div>
                        </>
                    ) : (
                        <VoiceOrb state={voice.state} tone={tone} onTap={() => (voice.state === 'listening' || voice.state === 'speaking' ? voice.stop() : voice.listen())} disabled={!voice.supported.listen} />
                    )}
                    {voice.state === 'listening' && voice.interim && <p className="text-sm font-medium text-slate-900 dark:text-white">“{voice.interim}”</p>}
                    <ErrorNote text={call.error || voice.error || error} />
                    {turns.length === 0 && (
                        <ul className="flex flex-wrap justify-center gap-2">
                            {OPENERS.map((o) => (
                                <li key={o}><button className={`min-h-9 rounded-full border border-slate-200 bg-white/70 px-3 text-xs font-medium text-slate-700 hover:border-blue-300 dark:border-white/10 dark:bg-white/5 dark:text-slate-200 cursor-pointer ${focusRing}`} onClick={() => ask(o, voice.speak, voice.settle)}>{o}</button></li>
                            ))}
                        </ul>
                    )}
                    <form className="flex w-full items-center gap-2" onSubmit={(e) => { e.preventDefault(); if (typed.trim()) { const t = typed.trim(); setTyped(''); ask(t, voice.speak, voice.settle); } }}>
                        <span className="flex h-11 w-8 flex-shrink-0 items-center justify-center text-slate-400"><Keyboard className="h-5 w-5" aria-hidden="true" /></span>
                        <label htmlFor="fs-type" className="sr-only">Type to your future self</label>
                        <input id="fs-type" className={input} value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Or type" maxLength={600} />
                        <button type="submit" className={primaryButton} disabled={!typed.trim() || voice.state === 'thinking'} aria-label="Send"><Send className="h-4 w-4" aria-hidden="true" /></button>
                    </form>
                </section>

                <section className={`${card} min-h-[24rem] space-y-5 p-5`} aria-label="Conversation with your future self" aria-live="polite">
                    {call.state !== 'idle' ? (
                        <div className="space-y-2">
                            {call.lines.length === 0 && <p className="text-sm text-slate-500 dark:text-slate-400">Connecting you to final year…</p>}
                            {call.lines.map((l, i) => (
                                <p key={i} className={`flex ${l.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                    <span className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${l.role === 'user' ? 'bg-blue-600 text-white' : tone === 'amber' ? 'border border-amber-200 bg-amber-50/80 text-slate-900 dark:border-amber-400/20 dark:bg-amber-500/10 dark:text-white' : 'border border-white/70 bg-white/70 text-slate-900 dark:border-white/5 dark:bg-white/5 dark:text-white'} ${l.final ? '' : 'opacity-70'}`}>{l.text}</span>
                                </p>
                            ))}
                        </div>
                    ) : turns.length === 0 ? (
                        <div className="flex h-full min-h-[20rem] flex-col items-center justify-center text-center">
                            <Sparkles className="h-8 w-8 text-amber-500" aria-hidden="true" />
                            <p className="mt-3 max-w-sm text-sm text-slate-600 dark:text-slate-400">
                                Your future self answers from your real projection: your pace, your plan and your goal. Nothing is made up; the numbers come from the time machine.
                            </p>
                        </div>
                    ) : (
                        turns.map((t, i) => {
                            const message: CompanionMessage = {
                                _id: `${i}`,
                                role: t.role === 'user' ? 'user' : 'companion',
                                kind: 'chat',
                                content: t.text,
                                widgets: t.reply ? t.reply.widgets : undefined,
                                actions: [],
                                createdAt: t.at,
                            };
                            return <MessageCard key={i} message={message} speaker={t.role === 'future' ? { name: `Future ${firstName}`, icon: Hourglass, tone: path === 'improved' ? 'amber' : 'blue' } : undefined} />;
                        })
                    )}
                    <div ref={endRef} />
                </section>
            </div>
        </div>
    );
}
