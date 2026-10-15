'use client';

import React from 'react';
import { BadgeCheck, Brain, Code2, FileText, GraduationCap, Mic, School, ShieldCheck } from 'lucide-react';
import type { PassportView } from '@/lib/growApi';
import { card, panel } from '@/components/classroom/ui';

const GOAL: Record<string, string> = {
    placement: 'Preparing for placements',
    higher_studies: 'Preparing for higher studies',
    govt_exam: 'Preparing for government exams',
    startup: 'Building a startup',
    undecided: 'Exploring',
};

function when(value: string) {
    return new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** The passport itself: used for the public page and the student's live preview. */
export default function PassportCard({ passport }: { passport: PassportView }) {
    const s = passport.sections;
    return (
        <article className="space-y-5">
            <header className={`${card} overflow-hidden`}>
                <div className="bg-gradient-to-br from-blue-700 via-indigo-600 to-violet-600 p-6 text-white">
                    <p className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold">
                        <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" /> Verified skill passport
                    </p>
                    <h1 className="mt-3 text-3xl font-bold tracking-tight">{passport.name}</h1>
                    {passport.headline && <p className="mt-1 text-white/90">{passport.headline}</p>}
                    {s.journey && (
                        <p className="mt-2 flex flex-wrap items-center gap-x-2 text-sm text-white/90">
                            <GraduationCap className="h-4 w-4" aria-hidden="true" /> {s.journey.degree} in {s.journey.branch}{s.journey.college ? `, ${s.journey.college}` : ''} · Year {s.journey.year}
                            {s.journey.goal ? ` · ${GOAL[s.journey.goal] || ''}${s.journey.targetRole ? ` (${s.journey.targetRole})` : ''}` : ''}
                        </p>
                    )}
                </div>
                <div className="grid grid-cols-2 gap-px bg-slate-200/60 dark:bg-white/5 sm:grid-cols-4">
                    <Metric label="Problems solved" value={s.dsa ? `${s.dsa.solved}` : '—'} />
                    <Metric label="Patterns mastered" value={s.dsa ? `${s.dsa.mastered.length}/15` : '—'} />
                    <Metric label="Best interview" value={s.interviews && s.interviews.best !== null ? `${s.interviews.best}/100` : '—'} />
                    <Metric label="Resume score" value={s.resume ? `${s.resume.best}/100` : '—'} />
                </div>
            </header>

            {s.dsa && (
                <section className={`${card} p-5`} aria-labelledby="pp-dsa">
                    <h2 id="pp-dsa" className="flex items-center gap-2 text-base font-bold text-slate-900 dark:text-white"><Code2 className="h-5 w-5 text-blue-600 dark:text-blue-400" aria-hidden="true" /> Problem solving</h2>
                    <p className="text-xs text-slate-600 dark:text-slate-400">
                        Every solution ran against hidden tests.{s.dsa.firstTryRate !== null ? ` ${s.dsa.firstTryRate}% solved on the first try.` : ''}{s.dsa.averageHints !== null ? ` Average ${s.dsa.averageHints} hints per solve.` : ''}
                    </p>
                    <ul className="mt-4 grid gap-x-6 gap-y-2.5 sm:grid-cols-2">
                        {s.dsa.patterns.map((p) => (
                            <li key={p.key}>
                                <div className="flex justify-between text-xs">
                                    <span className="font-medium text-slate-800 dark:text-slate-200">{p.name}{p.status === 'mastered' && <BadgeCheck className="ml-1 inline h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" aria-label="mastered" />}</span>
                                    <span className="tabular-nums text-slate-500 dark:text-slate-400">{p.solved}/{p.total} · {p.level}</span>
                                </div>
                                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-white/10" aria-hidden="true">
                                    <div className={`h-full rounded-full ${p.status === 'mastered' ? 'bg-emerald-500' : 'bg-blue-600 dark:bg-blue-500'}`} style={{ width: `${p.level}%` }} />
                                </div>
                            </li>
                        ))}
                    </ul>
                    {s.dsa.recent.length > 0 && (
                        <div className="mt-5">
                            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Recently solved</h3>
                            <ul className="mt-2 divide-y divide-slate-200/70 dark:divide-white/5">
                                {s.dsa.recent.map((r, i) => (
                                    <li key={i} className="flex items-center justify-between gap-3 py-2 text-sm">
                                        <span className="min-w-0 truncate text-slate-900 dark:text-white">{r.title} <span className="text-xs text-slate-500 dark:text-slate-400">· {r.pattern}{r.difficulty ? ` · ${r.difficulty}` : ''}</span></span>
                                        <span className="flex-shrink-0 text-xs text-slate-500 dark:text-slate-400">{r.hints ? `${r.hints} hint${r.hints > 1 ? 's' : ''}` : 'no hints'} · {when(r.at)}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </section>
            )}

            <div className="grid gap-5 md:grid-cols-2">
                {s.subjects && s.subjects.length > 0 && (
                    <section className={`${card} p-5`} aria-labelledby="pp-sub">
                        <h2 id="pp-sub" className="flex items-center gap-2 text-base font-bold text-slate-900 dark:text-white"><Brain className="h-5 w-5 text-violet-600 dark:text-violet-400" aria-hidden="true" /> Tested subjects</h2>
                        <ul className="mt-3 space-y-2.5">
                            {s.subjects.map((sub) => (
                                <li key={sub.name}>
                                    <div className="flex justify-between text-xs">
                                        <span className="font-medium text-slate-800 dark:text-slate-200">{sub.name}</span>
                                        <span className="tabular-nums text-slate-500 dark:text-slate-400">{sub.level}/100 · {sub.results} result{sub.results > 1 ? 's' : ''}</span>
                                    </div>
                                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-white/10" aria-hidden="true">
                                        <div className="h-full rounded-full bg-violet-600 dark:bg-violet-400" style={{ width: `${sub.level}%` }} />
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </section>
                )}

                {s.interviews && (
                    <section className={`${card} p-5`} aria-labelledby="pp-int">
                        <h2 id="pp-int" className="flex items-center gap-2 text-base font-bold text-slate-900 dark:text-white"><Mic className="h-5 w-5 text-rose-600 dark:text-rose-400" aria-hidden="true" /> Mock interviews</h2>
                        <p className="text-xs text-slate-600 dark:text-slate-400">{s.interviews.count} AI-scored interview{s.interviews.count > 1 ? 's' : ''}. Latest {s.interviews.latest ?? '—'}/100.</p>
                        <div className="mt-4 flex h-24 items-end gap-1.5" role="img" aria-label={`Interview scores: ${s.interviews.trend.map((t) => t.score).join(', ')}`}>
                            {s.interviews.trend.map((t, i) => (
                                <div key={i} className="flex flex-1 flex-col items-center gap-1">
                                    <div className="w-full rounded-t-md bg-rose-500/80" style={{ height: `${Math.max(6, t.score)}%` }} title={`${t.score}/100 · ${when(t.at)}`} />
                                </div>
                            ))}
                        </div>
                    </section>
                )}

                {s.classes && (
                    <section className={`${card} p-5`} aria-labelledby="pp-cls">
                        <h2 id="pp-cls" className="flex items-center gap-2 text-base font-bold text-slate-900 dark:text-white"><School className="h-5 w-5 text-teal-600 dark:text-teal-400" aria-hidden="true" /> Faculty classes</h2>
                        <p className="text-xs text-slate-600 dark:text-slate-400">
                            {s.classes.completed} assignments completed, {s.classes.onTime} on time{s.classes.averageGrade !== null ? `, average grade ${s.classes.averageGrade}%` : ''}.
                        </p>
                        <ul className="mt-3 space-y-1.5 text-sm">
                            {s.classes.list.map((c, i) => (
                                <li key={i} className="text-slate-800 dark:text-slate-200">{c.name}{c.mentor && <span className="text-slate-500 dark:text-slate-400"> · {c.mentor}{c.department ? `, ${c.department}` : ''}</span>}</li>
                            ))}
                        </ul>
                    </section>
                )}

                {s.resume && (
                    <section className={`${card} p-5`} aria-labelledby="pp-res">
                        <h2 id="pp-res" className="flex items-center gap-2 text-base font-bold text-slate-900 dark:text-white"><FileText className="h-5 w-5 text-amber-600 dark:text-amber-400" aria-hidden="true" /> Resume</h2>
                        <p className="mt-2 text-3xl font-bold tabular-nums text-slate-900 dark:text-white">{s.resume.best}<span className="text-base text-slate-500">/100</span></p>
                        <p className="text-xs text-slate-600 dark:text-slate-400">Best ATS score from the resume analyzer, {when(s.resume.at)}</p>
                    </section>
                )}
            </div>

            <footer className={`${panel} flex items-start gap-3 p-4 text-xs text-slate-700 dark:text-slate-300`}>
                <ShieldCheck className="mt-0.5 h-5 w-5 flex-shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                <p>
                    <span className="font-semibold text-slate-900 dark:text-white">How this is verified.</span> {passport.verification.note} Built from {passport.verification.results} recorded results since {when(passport.verification.since)}. Updated {when(passport.verification.updatedAt)}.
                </p>
            </footer>
        </article>
    );
}

function Metric({ label, value }: { label: string; value: string }) {
    return (
        <div className="bg-white/70 p-4 text-center dark:bg-[rgb(22_29_46/0.7)]">
            <p className="text-2xl font-bold tabular-nums text-slate-900 dark:text-white">{value}</p>
            <p className="text-xs text-slate-600 dark:text-slate-400">{label}</p>
        </div>
    );
}
