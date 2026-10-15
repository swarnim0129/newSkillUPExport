'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, Clock, Loader2, Radio, Trophy, Users, XCircle, Zap } from 'lucide-react';
import { errorMessage } from '@/lib/journeyApi';
import { answerStudentBattle, getStudentBattle, joinStudentBattle, type BattleState } from '@/lib/growApi';
import { card, ErrorNote, primaryButton, Spinner } from './ui';

const OPTION_STYLES = [
    'bg-rose-600 hover:bg-rose-700',
    'bg-blue-600 hover:bg-blue-700',
    'bg-amber-500 hover:bg-amber-600 text-slate-900',
    'bg-emerald-600 hover:bg-emerald-700',
];
const SHAPES = ['▲', '◆', '●', '■'];

/** The student's phone during a live battle. Polls the server every 1.5 seconds. */
export default function LiveStudent({ classId, getToken }: { classId: string; getToken: () => Promise<string | null> }) {
    const [battle, setBattle] = useState<BattleState | null | undefined>(undefined);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const timer = useRef<ReturnType<typeof setInterval> | null>(null);

    const poll = useCallback(async () => {
        try {
            const next = await getStudentBattle(await getToken(), classId);
            setBattle(next);
        } catch (err) {
            setError(errorMessage(err, 'Lost connection to the battle.'));
        }
    }, [classId, getToken]);

    useEffect(() => {
        void Promise.resolve().then(poll);
        timer.current = setInterval(poll, 1500);
        return () => { if (timer.current) clearInterval(timer.current); };
    }, [poll]);

    const act = async (fn: () => Promise<BattleState>) => {
        setBusy(true);
        setError('');
        try { setBattle(await fn()); } catch (err) { setError(errorMessage(err, 'That did not go through.')); } finally { setBusy(false); }
    };

    if (battle === undefined) return <Spinner label="Looking for a live battle" />;
    if (!battle) {
        return (
            <div className={`${card} mx-auto max-w-lg p-8 text-center`}>
                <Radio className="mx-auto h-9 w-9 text-slate-400" aria-hidden="true" />
                <h2 className="mt-3 text-lg font-bold text-slate-900 dark:text-white">No live battle right now</h2>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">When your mentor starts one in class, it appears here on its own. Keep this tab open.</p>
            </div>
        );
    }

    if (!battle.joined && battle.status !== 'ended') {
        return (
            <div className={`${card} mx-auto max-w-lg overflow-hidden text-center`}>
                <div className="bg-gradient-to-br from-violet-600 to-blue-700 p-8 text-white">
                    <Zap className="mx-auto h-10 w-10" aria-hidden="true" />
                    <h2 className="mt-3 text-2xl font-bold">{battle.title}</h2>
                    <p className="mt-1 text-sm text-white/90">{battle.total} questions · {battle.secondsPerQuestion} seconds each · {battle.players} joined</p>
                </div>
                <div className="p-6">
                    <button className={`${primaryButton} w-full text-base`} onClick={() => act(async () => joinStudentBattle(await getToken(), classId))} disabled={busy}>
                        {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Zap className="h-4 w-4" aria-hidden="true" />} Join the battle
                    </button>
                    <ErrorNote text={error} />
                </div>
            </div>
        );
    }

    const q = battle.question;
    return (
        <div className="mx-auto max-w-2xl space-y-4">
            <div className="flex items-center justify-between gap-3 text-sm">
                <span className="font-semibold text-slate-900 dark:text-white">{battle.title}</span>
                <span className="flex items-center gap-3 text-slate-600 dark:text-slate-400">
                    <span className="flex items-center gap-1"><Users className="h-4 w-4" aria-hidden="true" /> {battle.players}</span>
                    {battle.me && <span className="flex items-center gap-1 font-semibold text-slate-900 dark:text-white"><Trophy className="h-4 w-4 text-amber-500" aria-hidden="true" /> {battle.me.points} pts · #{battle.me.rank}</span>}
                </span>
            </div>

            {battle.status === 'lobby' && (
                <div className={`${card} p-10 text-center`} role="status">
                    <Loader2 className="mx-auto h-8 w-8 animate-spin text-blue-600" aria-hidden="true" />
                    <p className="mt-3 text-lg font-bold text-slate-900 dark:text-white">You are in. Waiting for your mentor to start.</p>
                </div>
            )}

            {(battle.status === 'question' || battle.status === 'reveal') && q && (
                <div className={`${card} space-y-4 p-5`}>
                    <div className="flex items-center justify-between text-xs font-semibold text-slate-600 dark:text-slate-400">
                        <span>Question {battle.current + 1} of {battle.total}</span>
                        {battle.status === 'question' && <span className="flex items-center gap-1 text-base tabular-nums text-slate-900 dark:text-white" aria-live="polite"><Clock className="h-4 w-4" aria-hidden="true" /> {battle.timeLeft}s</span>}
                    </div>
                    <p className="text-lg font-bold leading-snug text-slate-900 dark:text-white">{q.prompt}</p>
                    <div className="grid gap-3 sm:grid-cols-2">
                        {q.options.map((o, i) => {
                            const picked = battle.mine?.choice === i;
                            const isAnswer = battle.status === 'reveal' && q.answerIndex === i;
                            const locked = !!battle.mine || battle.status !== 'question';
                            return (
                                <button
                                    key={i}
                                    disabled={locked || busy}
                                    onClick={() => act(async () => answerStudentBattle(await getToken(), classId, battle.current, i))}
                                    className={`flex min-h-16 items-center gap-3 rounded-2xl px-4 text-left text-base font-semibold text-white shadow-[var(--neu-raise-sm)] transition-transform active:scale-[0.98] cursor-pointer disabled:cursor-default focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-300 ${OPTION_STYLES[i % 4]} ${locked && !picked && !isAnswer ? 'opacity-40' : ''} ${isAnswer ? 'ring-4 ring-emerald-300' : ''} ${picked ? 'ring-4 ring-white/70' : ''}`}
                                >
                                    <span className="text-xl" aria-hidden="true">{SHAPES[i % 4]}</span>
                                    <span className="flex-1">{o}</span>
                                    {isAnswer && <CheckCircle2 className="h-5 w-5" aria-label="Correct answer" />}
                                </button>
                            );
                        })}
                    </div>
                    {battle.mine && battle.status === 'question' && <p className="text-center text-sm font-semibold text-slate-700 dark:text-slate-300" role="status">Answer locked in. Waiting for the reveal…</p>}
                    {battle.status === 'reveal' && (
                        <p className={`flex items-center justify-center gap-2 text-center text-base font-bold ${battle.mine?.correct ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400'}`} role="status">
                            {battle.mine ? (battle.mine.correct ? <><CheckCircle2 className="h-5 w-5" aria-hidden="true" /> Correct! +{battle.mine.points}</> : <><XCircle className="h-5 w-5" aria-hidden="true" /> Not this time</>) : 'Time ran out'}
                        </p>
                    )}
                    {battle.status === 'reveal' && q.explanation && <p className="text-center text-sm text-slate-600 dark:text-slate-400">{q.explanation}</p>}
                </div>
            )}

            {battle.status === 'ended' && (
                <div className={`${card} p-6 text-center`}>
                    <Trophy className="mx-auto h-10 w-10 text-amber-500" aria-hidden="true" />
                    <h2 className="mt-2 text-xl font-bold text-slate-900 dark:text-white">Battle over</h2>
                    {battle.me && <p className="text-sm text-slate-700 dark:text-slate-300">You finished #{battle.me.rank} with {battle.me.points} points ({battle.me.correct} correct).</p>}
                </div>
            )}

            {battle.leaderboard.length > 0 && battle.status !== 'question' && (
                <ol className={`${card} divide-y divide-slate-200/70 p-2 dark:divide-white/5`} aria-label="Top players">
                    {battle.leaderboard.map((r) => (
                        <li key={r.candidateId} className="flex items-center justify-between px-3 py-2 text-sm">
                            <span className="text-slate-900 dark:text-white"><span className="mr-2 font-bold tabular-nums text-slate-500">{r.rank}</span>{r.name}</span>
                            <span className="font-bold tabular-nums text-slate-900 dark:text-white">{r.points}</span>
                        </li>
                    ))}
                </ol>
            )}
            <ErrorNote text={error} />
        </div>
    );
}
