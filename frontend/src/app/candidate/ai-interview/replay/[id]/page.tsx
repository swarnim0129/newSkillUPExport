'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useAuth } from '@clerk/nextjs';
import { ArrowLeft, Loader2, Milestone, Sparkles, Wand2 } from 'lucide-react';
import { errorMessage } from '@/lib/journeyApi';
import { getBetterAnswer, getReplay, replayToPlan, type ReplayTurn, type ReplayView } from '@/lib/growApi';
import { card, ErrorNote, focusRing, panel, primaryButton, secondaryButton, Spinner } from '@/components/classroom/ui';

// Tone shown as colour plus words, never colour alone
const TONE: Record<ReplayTurn['tone'], { label: string; bar: string; chip: string }> = {
    confident: { label: 'Confident', bar: 'bg-emerald-500', chip: 'bg-emerald-50 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300' },
    okay: { label: 'Okay', bar: 'bg-sky-500', chip: 'bg-sky-50 text-sky-800 dark:bg-sky-500/15 dark:text-sky-300' },
    hesitant: { label: 'Hesitant', bar: 'bg-amber-500', chip: 'bg-amber-50 text-amber-900 dark:bg-amber-500/15 dark:text-amber-300' },
    filler: { label: 'Filler words', bar: 'bg-orange-500', chip: 'bg-orange-50 text-orange-900 dark:bg-orange-500/15 dark:text-orange-300' },
    short: { label: 'Too short', bar: 'bg-red-500', chip: 'bg-red-50 text-red-800 dark:bg-red-500/15 dark:text-red-300' },
};

export default function ReplayPage() {
    const { id } = useParams<{ id: string }>();
    const { getToken, isLoaded, isSignedIn } = useAuth();
    const [data, setData] = useState<ReplayView | null>(null);
    const [error, setError] = useState('');
    const [active, setActive] = useState(0);
    const [planNote, setPlanNote] = useState('');

    const load = useCallback(async () => {
        try {
            const next = await getReplay(await getToken(), id);
            setData(next);
            const weakest = next.summary.weakest;
            if (weakest) setActive(weakest.index);
        } catch (err) {
            setError(errorMessage(err, 'Could not load this replay.'));
        }
    }, [getToken, id]);
    useEffect(() => { if (isLoaded && isSignedIn) void Promise.resolve().then(load); }, [isLoaded, isSignedIn, load]);

    if (!data) return error ? <ErrorNote text={error} /> : <Spinner label="Building your replay" />;
    const turn = data.turns[active];
    const iv = data.interview;

    return (
        <div className="space-y-5 pb-10">
            <Link href="/candidate/ai-interview/replay" className={`inline-flex min-h-11 items-center gap-1.5 rounded-lg text-sm font-semibold text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white ${focusRing}`}>
                <ArrowLeft className="h-4 w-4" aria-hidden="true" /> All replays
            </Link>

            <section className={`${card} p-5`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <h1 className="text-xl font-bold text-slate-900 dark:text-white">{iv.seniority} {iv.role}</h1>
                        <p className="text-sm text-slate-600 dark:text-slate-400">{iv.category} · {new Date(iv.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                    </div>
                    <div className="flex gap-3 text-center">
                        <div><p className="text-2xl font-bold tabular-nums text-slate-900 dark:text-white">{data.summary.average ?? '—'}</p><p className="text-xs text-slate-600 dark:text-slate-400">Delivery score</p></div>
                        <div><p className="text-2xl font-bold tabular-nums text-slate-900 dark:text-white">{data.summary.confident}/{data.summary.answers}</p><p className="text-xs text-slate-600 dark:text-slate-400">Confident answers</p></div>
                        <div><p className="text-2xl font-bold tabular-nums text-slate-900 dark:text-white">{data.summary.fillers}</p><p className="text-xs text-slate-600 dark:text-slate-400">Filler words</p></div>
                    </div>
                </div>

                <h2 className="mt-5 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Heatmap · one band per answer</h2>
                <div className="mt-2 flex h-14 gap-1 overflow-hidden rounded-xl" role="tablist" aria-label="Answers">
                    {data.turns.map((t) => (
                        <button
                            key={t.index}
                            role="tab"
                            aria-selected={active === t.index}
                            aria-label={`Answer ${t.index + 1}: ${TONE[t.tone].label}, score ${t.score}`}
                            onClick={() => setActive(t.index)}
                            className={`relative flex-1 ${TONE[t.tone].bar} transition-opacity cursor-pointer focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-300 ${active === t.index ? 'opacity-100' : 'opacity-60 hover:opacity-90'}`}
                            style={{ flexGrow: Math.max(1, Math.min(4, t.words / 30)) }}
                        >
                            {active === t.index && <span className="absolute inset-x-0 bottom-0 h-1.5 bg-slate-900 dark:bg-white" aria-hidden="true" />}
                        </button>
                    ))}
                </div>
                <ul className="mt-2 flex flex-wrap gap-3 text-xs text-slate-600 dark:text-slate-400" aria-label="Legend">
                    {Object.entries(TONE).map(([k, v]) => <li key={k} className="flex items-center gap-1.5"><span className={`h-2.5 w-2.5 rounded-sm ${v.bar}`} aria-hidden="true" />{v.label}</li>)}
                </ul>
            </section>

            {turn && <TurnCard key={turn.index} turn={turn} interviewId={id} getToken={getToken} />}

            <section className={`${card} flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between`}>
                <p className="text-sm text-slate-700 dark:text-slate-300">Practise the weak spots: add a focused retake to your plan.</p>
                <div className="flex items-center gap-3">
                    {planNote && <span className="text-sm text-emerald-700 dark:text-emerald-400" role="status">{planNote}</span>}
                    <button className={secondaryButton} onClick={async () => { try { const r = await replayToPlan(await getToken(), id); setPlanNote(r.added ? 'Added to your plan.' : 'Already in your plan.'); } catch (err) { setPlanNote(errorMessage(err, 'Could not add it.')); } }}>
                        <Milestone className="h-4 w-4" aria-hidden="true" /> Add retake to my plan
                    </button>
                </div>
            </section>
        </div>
    );
}

function TurnCard({ turn, interviewId, getToken }: { turn: ReplayTurn; interviewId: string; getToken: () => Promise<string | null> }) {
    const [better, setBetter] = useState<{ answer: string; changes: string[] } | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const tone = TONE[turn.tone];

    const improve = async () => {
        setBusy(true);
        setError('');
        try { setBetter(await getBetterAnswer(await getToken(), interviewId, turn.index)); }
        catch (err) { setError(errorMessage(err, 'Could not write a better answer.')); }
        finally { setBusy(false); }
    };

    return (
        <section className={`${card} space-y-4 p-5`} aria-label={`Answer ${turn.index + 1}`}>
            <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${tone.chip}`}>{tone.label} · {turn.score}/100</span>
                <span className="text-xs text-slate-500 dark:text-slate-400">{turn.words} words · {turn.fillers} fillers · {turn.hedges} hedges</span>
            </div>
            {turn.question && (
                <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Interviewer asked</p>
                    <p className="mt-1 text-sm text-slate-800 dark:text-slate-200">{turn.question}</p>
                </div>
            )}
            <div className={`${panel} p-3`}>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">You said</p>
                <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-slate-900 dark:text-white">{turn.answer}</p>
            </div>
            <ul className="flex flex-wrap gap-2">
                {turn.reasons.map((r) => <li key={r} className="rounded-full border border-slate-200 bg-white/70 px-2.5 py-1 text-xs text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-slate-300">{r}</li>)}
            </ul>
            {better ? (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 p-4 dark:border-emerald-400/20 dark:bg-emerald-500/10">
                    <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-emerald-800 dark:text-emerald-300"><Sparkles className="h-3.5 w-3.5" aria-hidden="true" /> A stronger answer</p>
                    <p className="mt-2 text-sm leading-relaxed text-slate-900 dark:text-white">{better.answer}</p>
                    {better.changes.length > 0 && (
                        <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-slate-700 dark:text-slate-300">{better.changes.map((c) => <li key={c}>{c}</li>)}</ul>
                    )}
                </div>
            ) : (
                <button className={primaryButton} onClick={improve} disabled={busy}>
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Wand2 className="h-4 w-4" aria-hidden="true" />} Show me a better answer
                </button>
            )}
            <ErrorNote text={error} />
        </section>
    );
}
