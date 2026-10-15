'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useAuth, useUser } from '@clerk/nextjs';
import {
    AlertTriangle,
    ArrowRight,
    BookMarked,
    CalendarCheck,
    Loader2,
    Send,
    Sparkles,
} from 'lucide-react';
import MessageCard from '@/components/companion/MessageCard';
import VoiceTab from '@/components/companion/VoiceTab';
import FutureSelfTab from '@/components/companion/FutureSelfTab';
import { Tabs } from '@/components/classroom/ui';
import {
    errorMessage,
    getThread,
    isNotSetUp,
    sendMessage,
    type CompanionMessage,
    type MemoryFact,
    type Stage,
} from '@/lib/journeyApi';
import { scrollIntoPanel } from '@/lib/scroll';

const card = 'bg-white dark:bg-[var(--soft-surface)] rounded-2xl shadow-sm dark:shadow-black/20 border border-slate-200 dark:border-[var(--soft-line)]';
const focusRing = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-black';
const primaryButton = `inline-flex items-center justify-center gap-2 min-h-11 px-4 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors ${focusRing}`;

const QUICK_PROMPTS = [
    'What should I focus on this week?',
    'How am I doing so far?',
    'I have exams for the next two weeks.',
    'I am thinking of changing my goal.',
];

export default function CompanionPage() {
    const { getToken, isLoaded, isSignedIn } = useAuth();
    const { user } = useUser();
    const [tab, setTab] = useState<'chat' | 'voice' | 'future'>('chat');
    const [loading, setLoading] = useState(true);
    const [notSetUp, setNotSetUp] = useState(false);
    const [loadError, setLoadError] = useState('');
    const [messages, setMessages] = useState<CompanionMessage[]>([]);
    const [memory, setMemory] = useState<MemoryFact[]>([]);
    const [stage, setStage] = useState<Stage | null>(null);
    const [draft, setDraft] = useState('');
    const [sending, setSending] = useState(false);
    const [sendError, setSendError] = useState('');
    const endRef = useRef<HTMLDivElement>(null);

    const load = useCallback(async () => {
        try {
            const data = await getThread(await getToken());
            setMessages(data.messages);
            setMemory(data.memory || []);
            setStage(data.stage);
            setLoadError('');
        } catch (err) {
            if (isNotSetUp(err)) setNotSetUp(true);
            else setLoadError(errorMessage(err, 'Could not load the conversation. Check that the server is running and try again.'));
        } finally {
            setLoading(false);
        }
    }, [getToken]);

    useEffect(() => {
        if (isLoaded && isSignedIn) void Promise.resolve().then(load);
    }, [isLoaded, isSignedIn, load]);

    useEffect(() => {
        scrollIntoPanel(endRef.current);
    }, [messages, sending]);

    const send = async (text: string) => {
        const message = text.trim();
        if (!message || sending) return;
        setSending(true);
        setSendError('');
        setDraft('');
        try {
            const data = await sendMessage(await getToken(), message);
            setMessages((prev) => [...prev, ...data.messages]);
            setMemory(data.memory || []);
        } catch (err) {
            // Give the text back so nothing the student typed is lost
            setDraft(message);
            setSendError(errorMessage(err, 'Your message was not sent. Please try again.'));
        } finally {
            setSending(false);
        }
    };

    if (loading) {
        return (
            <div className="flex min-h-[60vh] items-center justify-center" role="status" aria-live="polite">
                <Loader2 className="h-8 w-8 animate-spin text-blue-600" aria-hidden="true" />
                <span className="sr-only">Loading your companion</span>
            </div>
        );
    }

    if (notSetUp) {
        return (
            <div className={`${card} max-w-xl mx-auto mt-10 p-8 text-center`}>
                <CalendarCheck className="h-8 w-8 mx-auto text-blue-600 dark:text-blue-400" aria-hidden="true" />
                <h1 className="mt-3 text-xl font-bold text-slate-900 dark:text-white">Set up your journey first</h1>
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                    Your companion needs to know your branch, semester and goal before it can help. It takes about a minute.
                </p>
                <Link href="/candidate/journey" className={`${primaryButton} mt-5`}>
                    Set up my journey <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
            </div>
        );
    }

    if (loadError) {
        return (
            <div className="max-w-xl mx-auto mt-16 text-center">
                <AlertTriangle className="h-8 w-8 mx-auto text-red-500" aria-hidden="true" />
                <p className="mt-3 text-sm text-slate-700 dark:text-slate-300" role="alert">{loadError}</p>
                <button className={`${primaryButton} mt-4`} onClick={() => { setLoading(true); load(); }}>Try again</button>
            </div>
        );
    }

    return (
        <div className="flex h-full min-h-0 flex-col gap-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">Companion</h1>
                    <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                        Knows your plan, your results and what you have told it. Stays with you until you graduate.
                    </p>
                </div>
                {stage && (
                    <span className="inline-flex items-center gap-2 self-start rounded-full border border-blue-200 dark:border-blue-500/30 bg-blue-50/80 dark:bg-blue-500/10 px-3 py-1.5 text-xs font-semibold text-blue-700 dark:text-blue-300 sm:self-auto">
                        <Sparkles className="h-3.5 w-3.5" aria-hidden="true" /> Year {stage.year} · {stage.name} mode
                    </span>
                )}
            </div>

            <Tabs<'chat' | 'voice' | 'future'>
                label="Companion modes"
                value={tab}
                onChange={setTab}
                tabs={[
                    { key: 'chat', label: 'Chat' },
                    { key: 'voice', label: 'Voice' },
                    { key: 'future', label: 'Future Self' },
                ]}
            />

            {tab === 'voice' && (
                <VoiceTab getToken={getToken} onMessages={(next, mem) => { setMessages((prev) => [...prev, ...next]); setMemory(mem); }} />
            )}
            {tab === 'future' && <FutureSelfTab getToken={getToken} firstName={user?.firstName || 'you'} />}

            {tab === 'chat' && (
            <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
                {/* Conversation */}
                <section className={`${card} flex min-h-[32rem] flex-col lg:min-h-0`} aria-label="Conversation">
                    <div className="flex-1 space-y-5 overflow-y-auto p-4 sm:p-6" role="log" aria-live="polite" aria-relevant="additions">
                        {messages.length === 0 && (
                            <p className="text-sm text-slate-500 dark:text-slate-400">No messages yet. Say hello, or pick a question below.</p>
                        )}
                        {messages.map((message) => (
                            <MessageCard key={message._id} message={message} />
                        ))}
                        {sending && (
                            <div className="flex items-center gap-3 pl-12" role="status">
                                <span className="flex gap-1" aria-hidden="true">
                                    <span className="h-2 w-2 animate-bounce rounded-full bg-blue-600 [animation-delay:-0.3s]" />
                                    <span className="h-2 w-2 animate-bounce rounded-full bg-blue-600 [animation-delay:-0.15s]" />
                                    <span className="h-2 w-2 animate-bounce rounded-full bg-blue-600" />
                                </span>
                                <span className="text-sm text-slate-500 dark:text-slate-400">Reading your plan and results</span>
                            </div>
                        )}
                        <div ref={endRef} />
                    </div>

                    <form
                        className="border-t border-white/60 dark:border-white/5 p-3 sm:p-4"
                        onSubmit={(e) => { e.preventDefault(); send(draft); }}
                    >
                        <div className="mb-3 flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Suggested questions">
                            {QUICK_PROMPTS.map((prompt) => (
                                <button
                                    key={prompt}
                                    type="button"
                                    className={`min-h-9 flex-shrink-0 rounded-full border border-slate-200 dark:border-white/10 bg-white/70 dark:bg-white/5 px-3 text-xs font-medium text-slate-700 dark:text-slate-200 hover:border-blue-300 hover:text-blue-700 dark:hover:text-blue-300 disabled:opacity-60 cursor-pointer ${focusRing}`}
                                    onClick={() => send(prompt)}
                                    disabled={sending}
                                >
                                    {prompt}
                                </button>
                            ))}
                        </div>
                        {sendError && (
                            <p className="mb-2 flex items-center gap-2 text-sm text-red-600 dark:text-red-400" role="alert">
                                <AlertTriangle className="h-4 w-4 flex-shrink-0" aria-hidden="true" /> {sendError}
                            </p>
                        )}
                        <label htmlFor="companion-message" className="sr-only">Message to your companion</label>
                        <div className="flex items-end gap-2 rounded-2xl border border-slate-200 dark:border-white/10 bg-white/80 dark:bg-[var(--soft-sunken)] p-1.5 shadow-[var(--neu-inset)] focus-within:ring-2 focus-within:ring-blue-500">
                            <textarea
                                id="companion-message"
                                rows={1}
                                maxLength={2000}
                                className="max-h-40 min-h-11 flex-1 resize-none bg-transparent px-3 py-2.5 text-sm text-slate-900 dark:text-white placeholder:text-slate-500 focus:outline-none"
                                placeholder="Ask about your plan, or tell me what is going on"
                                value={draft}
                                onChange={(e) => setDraft(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        send(draft);
                                    }
                                }}
                                disabled={sending}
                            />
                            <button type="submit" className={`${primaryButton} rounded-xl`} disabled={sending || !draft.trim()} aria-label="Send message">
                                {sending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Send className="h-4 w-4" aria-hidden="true" />}
                                <span className="hidden sm:inline">Send</span>
                            </button>
                        </div>
                        <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">Enter to send, Shift and Enter for a new line.</p>
                    </form>
                </section>

                {/* Memory */}
                <aside className="min-h-0 lg:overflow-y-auto" aria-labelledby="memory-heading">
                    <section className={`${card} p-5`}>
                        <h2 id="memory-heading" className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
                            <BookMarked className="h-4 w-4 text-blue-600 dark:text-blue-400" aria-hidden="true" /> What I remember
                        </h2>
                        {memory.length === 0 ? (
                            <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">Nothing yet. Tell me about exams, commitments or preferences and I will keep them in mind.</p>
                        ) : (
                            <ul className="mt-3 space-y-2">
                                {[...memory].reverse().slice(0, 12).map((fact, i) => (
                                    <li key={`${fact.createdAt}-${i}`} className="flex items-start gap-2 rounded-xl bg-white/60 dark:bg-white/[0.04] px-3 py-2 text-sm text-slate-800 dark:text-slate-200 shadow-[var(--neu-inset)]">
                                        <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-blue-600" aria-hidden="true" />
                                        {fact.text}
                                    </li>
                                ))}
                            </ul>
                        )}
                        <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">I use these in every answer and check-in. Tell me if something is wrong and I will update it.</p>
                    </section>
                </aside>
            </div>
            )}
        </div>
    );
}
