'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Expand, Loader2, Play, Radio, SkipForward, Sparkles, Square, Trophy, Users, Eye } from 'lucide-react';
import { errorMessage } from '@/lib/journeyApi';
import { draftQuiz, type MentorWork, type QuizQuestion } from '@/lib/mentorApi';
import { controlMentorBattle, createMentorBattle, getMentorBattle, type BattleState } from '@/lib/growApi';
import { card, dangerButton, ErrorNote, input, label, panel, primaryButton, secondaryButton, Spinner } from './ui';

const OPTION_STYLES = ['bg-rose-600', 'bg-blue-600', 'bg-amber-500 text-slate-900', 'bg-emerald-600'];
const SHAPES = ['▲', '◆', '●', '■'];

/** Mentor's projector view for a live class battle. */
export default function LiveMentor({ classId, quizzes, getToken }: { classId: string; quizzes: MentorWork[]; getToken: () => Promise<string | null> }) {
    const [battle, setBattle] = useState<BattleState | null | undefined>(undefined);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState('');
    const [setup, setSetup] = useState(false);
    const stageRef = useRef<HTMLDivElement>(null);

    const poll = useCallback(async () => {
        try {
            const next = await getMentorBattle(await getToken(), classId);
            setBattle(next);
        } catch (err) {
            setError(errorMessage(err, 'Lost connection to the battle.'));
        }
    }, [classId, getToken]);

    useEffect(() => {
        void Promise.resolve().then(poll);
        const t = setInterval(poll, 1500);
        return () => clearInterval(t);
    }, [poll]);

    const control = async (action: 'start' | 'reveal' | 'next' | 'end') => {
        if (!battle) return;
        setBusy(action);
        try { setBattle(await controlMentorBattle(await getToken(), classId, battle.id, action)); } catch (err) { setError(errorMessage(err, 'Could not update the battle.')); } finally { setBusy(''); }
    };

    if (battle === undefined) return <Spinner label="Loading live battle" />;
    if (!battle || battle.status === 'ended' || setup) {
        return (
            <div className="space-y-5">
                {battle && battle.status === 'ended' && !setup && <Results battle={battle} />}
                <BattleSetup classId={classId} quizzes={quizzes} getToken={getToken} onCreated={(b) => { setBattle(b); setSetup(false); }} onCancel={battle && battle.status !== 'ended' ? () => setSetup(false) : undefined} />
            </div>
        );
    }

    const q = battle.question;
    const totalAnswers = battle.distribution ? battle.distribution.reduce((a, b) => a + b, 0) : 0;
    return (
        <div className="space-y-4">
            <div ref={stageRef} className="space-y-5 rounded-3xl bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 p-6 text-white sm:p-8">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-lg font-bold">{battle.title}</p>
                    <div className="flex items-center gap-4 text-sm">
                        <span className="flex items-center gap-1.5"><Users className="h-4 w-4" aria-hidden="true" /> {battle.players} players</span>
                        {battle.status === 'question' && <span className="rounded-full bg-white/15 px-3 py-1 text-lg font-bold tabular-nums" aria-live="polite">{battle.timeLeft}s</span>}
                    </div>
                </div>

                {battle.status === 'lobby' ? (
                    <div className="py-10 text-center">
                        <Radio className="mx-auto h-12 w-12 text-violet-300 motion-safe:animate-pulse" aria-hidden="true" />
                        <p className="mt-4 text-3xl font-bold">Join from your phone</p>
                        <p className="mt-2 text-white/80">SkillUp → Classes → this class → Live tab</p>
                        <p className="mt-6 text-5xl font-bold tabular-nums">{battle.players}</p>
                        <p className="text-white/80">joined</p>
                    </div>
                ) : q && (
                    <>
                        <p className="text-sm text-white/70">Question {battle.current + 1} of {battle.total}</p>
                        <p className="text-2xl font-bold leading-snug sm:text-3xl">{q.prompt}</p>
                        <div className="grid gap-3 sm:grid-cols-2">
                            {q.options.map((o, i) => {
                                const count = battle.distribution ? battle.distribution[i] : 0;
                                const reveal = battle.status === 'reveal';
                                const right = q.answerIndex === i;
                                return (
                                    <div key={i} className={`relative overflow-hidden rounded-2xl px-4 py-4 font-semibold ${OPTION_STYLES[i % 4]} ${reveal && !right ? 'opacity-40' : ''} ${reveal && right ? 'ring-4 ring-emerald-300' : ''}`}>
                                        <div className="relative flex items-center gap-3">
                                            <span className="text-xl" aria-hidden="true">{SHAPES[i % 4]}</span>
                                            <span className="flex-1 text-lg">{o}</span>
                                            {reveal && <span className="text-lg font-bold tabular-nums">{count}</span>}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                        <p className="text-center text-sm text-white/80">{battle.status === 'question' ? `${battle.answered} of ${battle.players} answered` : `${totalAnswers} answered${q.explanation ? ` · ${q.explanation}` : ''}`}</p>
                    </>
                )}

                {battle.status === 'reveal' && battle.leaderboard.length > 0 && (
                    <ol className="mx-auto max-w-md space-y-1.5" aria-label="Leaderboard">
                        {battle.leaderboard.slice(0, 5).map((r) => (
                            <li key={r.candidateId} className="flex items-center justify-between rounded-xl bg-white/10 px-4 py-2">
                                <span><span className="mr-2 font-bold tabular-nums text-white/60">{r.rank}</span>{r.name}</span>
                                <span className="font-bold tabular-nums">{r.points}</span>
                            </li>
                        ))}
                    </ol>
                )}
            </div>

            <div className="flex flex-wrap gap-2">
                {battle.status === 'lobby' && <button className={primaryButton} onClick={() => control('start')} disabled={!!busy || battle.players === 0}>{busy === 'start' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Play className="h-4 w-4" aria-hidden="true" />} Start{battle.players === 0 ? ' (waiting for players)' : ''}</button>}
                {battle.status === 'question' && <button className={primaryButton} onClick={() => control('reveal')} disabled={!!busy}><Eye className="h-4 w-4" aria-hidden="true" /> Reveal now</button>}
                {battle.status === 'reveal' && <button className={primaryButton} onClick={() => control('next')} disabled={!!busy}><SkipForward className="h-4 w-4" aria-hidden="true" /> {battle.current + 1 >= battle.total ? 'Finish' : 'Next question'}</button>}
                <button className={secondaryButton} onClick={() => stageRef.current?.requestFullscreen?.()}><Expand className="h-4 w-4" aria-hidden="true" /> Full screen</button>
                <button className={dangerButton} onClick={() => { if (window.confirm('End the battle now?')) control('end'); }} disabled={!!busy}><Square className="h-4 w-4" aria-hidden="true" /> End</button>
            </div>
            <ErrorNote text={error} />
        </div>
    );
}

function Results({ battle }: { battle: BattleState }) {
    return (
        <section className={`${card} p-5`} aria-labelledby="results-heading">
            <h2 id="results-heading" className="flex items-center gap-2 text-lg font-bold text-slate-900 dark:text-white"><Trophy className="h-5 w-5 text-amber-500" aria-hidden="true" /> Last battle: {battle.title}</h2>
            <ol className="mt-3 space-y-1.5">
                {battle.leaderboard.slice(0, 10).map((r) => (
                    <li key={r.candidateId} className={`${panel} flex items-center justify-between px-3 py-2 text-sm`}>
                        <span className="text-slate-900 dark:text-white"><span className="mr-2 font-bold tabular-nums text-slate-500">{r.rank}</span>{r.name}</span>
                        <span className="tabular-nums text-slate-700 dark:text-slate-300"><span className="font-bold text-slate-900 dark:text-white">{r.points}</span> pts · {r.correct} correct</span>
                    </li>
                ))}
            </ol>
        </section>
    );
}

function BattleSetup({ classId, quizzes, getToken, onCreated, onCancel }: { classId: string; quizzes: MentorWork[]; getToken: () => Promise<string | null>; onCreated: (b: BattleState) => void; onCancel?: () => void }) {
    const [source, setSource] = useState<'quiz' | 'ai'>(quizzes.length ? 'quiz' : 'ai');
    const [quizId, setQuizId] = useState(quizzes[0]?.id || '');
    const [topic, setTopic] = useState('');
    const [count, setCount] = useState(5);
    const [seconds, setSeconds] = useState(20);
    const [drafted, setDrafted] = useState<QuizQuestion[] | null>(null);
    const [busy, setBusy] = useState('');
    const [error, setError] = useState('');

    const draft = async () => {
        setBusy('draft');
        setError('');
        try { setDrafted(await draftQuiz(await getToken(), classId, { topic: topic.trim(), count, level: 'medium' })); }
        catch (err) { setError(errorMessage(err, 'Could not draft questions.')); }
        finally { setBusy(''); }
    };

    const create = async () => {
        setBusy('create');
        setError('');
        try {
            const body = source === 'quiz'
                ? { assignmentId: quizId, secondsPerQuestion: seconds }
                : { title: `Live: ${topic.trim()}`.slice(0, 120), questions: drafted || [], secondsPerQuestion: seconds };
            onCreated(await createMentorBattle(await getToken(), classId, body));
        } catch (err) {
            setError(errorMessage(err, 'Could not open the battle.'));
        } finally {
            setBusy('');
        }
    };

    return (
        <section className={`${card} space-y-5 p-6`} aria-labelledby="setup-heading">
            <div>
                <h2 id="setup-heading" className="flex items-center gap-2 text-lg font-bold text-slate-900 dark:text-white"><Radio className="h-5 w-5 text-violet-600" aria-hidden="true" /> Start a live battle</h2>
                <p className="text-sm text-slate-600 dark:text-slate-400">A timed quiz everyone answers from their phone, with a live leaderboard on your screen. Fast correct answers score more.</p>
            </div>
            <div className="flex gap-2" role="radiogroup" aria-label="Questions from">
                {([['quiz', 'From a class quiz'], ['ai', 'Draft with AI']] as const).map(([k, l]) => (
                    <button key={k} role="radio" aria-checked={source === k} onClick={() => setSource(k)} disabled={k === 'quiz' && !quizzes.length}
                        className={`min-h-11 rounded-xl border px-4 text-sm font-semibold cursor-pointer disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${source === k ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-200 bg-white/70 text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-slate-200'}`}>{l}</button>
                ))}
            </div>
            {source === 'quiz' ? (
                <div>
                    <label htmlFor="bt-quiz" className={label}>Quiz</label>
                    <select id="bt-quiz" className={input} value={quizId} onChange={(e) => setQuizId(e.target.value)}>
                        {quizzes.map((q) => <option key={q.id} value={q.id}>{q.title} ({q.questionCount} questions)</option>)}
                    </select>
                </div>
            ) : (
                <div className="space-y-3">
                    <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
                        <label htmlFor="bt-topic" className="sr-only">Topic</label>
                        <input id="bt-topic" className={input} value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Topic, e.g. Sorting algorithms" maxLength={200} />
                        <label htmlFor="bt-count" className="sr-only">Questions</label>
                        <select id="bt-count" className={input} value={count} onChange={(e) => setCount(Number(e.target.value))}>
                            {[5, 8, 10].map((n) => <option key={n} value={n}>{n} questions</option>)}
                        </select>
                        <button className={secondaryButton} onClick={draft} disabled={!topic.trim() || !!busy}>{busy === 'draft' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Sparkles className="h-4 w-4" aria-hidden="true" />} Draft</button>
                    </div>
                    {drafted && (
                        <ol className={`${panel} max-h-56 space-y-1.5 overflow-y-auto p-3 text-sm`}>
                            {drafted.map((q, i) => <li key={i} className="text-slate-800 dark:text-slate-200">{i + 1}. {q.prompt} <span className="text-xs text-emerald-700 dark:text-emerald-400">({q.options[q.answerIndex]})</span></li>)}
                        </ol>
                    )}
                </div>
            )}
            <div>
                <div className="flex items-baseline justify-between"><label htmlFor="bt-sec" className="text-sm font-medium text-slate-800 dark:text-slate-200">Seconds per question</label><span className="font-bold tabular-nums text-blue-700 dark:text-blue-400">{seconds}</span></div>
                <input id="bt-sec" type="range" min={10} max={60} step={5} value={seconds} onChange={(e) => setSeconds(Number(e.target.value))} className="w-full accent-blue-600" />
            </div>
            <ErrorNote text={error} />
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                {onCancel && <button className={secondaryButton} onClick={onCancel}>Back</button>}
                <button className={primaryButton} onClick={create} disabled={!!busy || (source === 'quiz' ? !quizId : !drafted?.length)}>
                    {busy === 'create' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Radio className="h-4 w-4" aria-hidden="true" />} Open the lobby
                </button>
            </div>
        </section>
    );
}
