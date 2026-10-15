'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@clerk/nextjs';
import { BellRing, Check, Clipboard, Flame, KeyRound, Loader2, LogOut, Plus, School, Users } from 'lucide-react';
import { errorMessage } from '@/lib/journeyApi';
import { createSquad, joinSquad, leaveSquad, listSquads, nudgeSquadmate, type SquadView } from '@/lib/growApi';
import { Avatar, card, ErrorNote, iconButton, input, label, primaryButton, secondaryButton, Spinner } from '@/components/classroom/ui';

export default function SquadsPage() {
    const { getToken, isLoaded, isSignedIn } = useAuth();
    const [squads, setSquads] = useState<SquadView[] | null>(null);
    const [error, setError] = useState('');

    const load = useCallback(async () => {
        try {
            const next = await listSquads(await getToken());
            setSquads(next);
        } catch (err) {
            setError(errorMessage(err, 'Could not load your squads.'));
        }
    }, [getToken]);
    useEffect(() => { if (isLoaded && isSignedIn) void Promise.resolve().then(load); }, [isLoaded, isSignedIn, load]);

    return (
        <div className="space-y-6 pb-10">
            <div>
                <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-3xl">Study squads</h1>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Two to four friends, one shared flame. A day counts only when everyone in the squad practises, so nobody gets left behind.</p>
            </div>
            <StartCard getToken={getToken} onDone={load} />
            <ErrorNote text={error} />
            {!squads ? (
                <Spinner label="Loading squads" />
            ) : squads.length === 0 ? (
                <div className={`${card} p-8 text-center`}>
                    <Users className="mx-auto h-8 w-8 text-blue-600 dark:text-blue-400" aria-hidden="true" />
                    <p className="mt-3 text-sm text-slate-700 dark:text-slate-300">No squad yet. Start one and share the code, or join with a friend&apos;s code.</p>
                </div>
            ) : (
                <ul className="grid gap-5 xl:grid-cols-2">
                    {squads.map((s) => (
                        <li key={s.id}><SquadCard squad={s} getToken={getToken} onChange={load} /></li>
                    ))}
                </ul>
            )}
        </div>
    );
}

function StartCard({ getToken, onDone }: { getToken: () => Promise<string | null>; onDone: () => void }) {
    const [name, setName] = useState('');
    const [code, setCode] = useState('');
    const [busy, setBusy] = useState('');
    const [error, setError] = useState('');
    const run = async (kind: 'create' | 'join') => {
        setBusy(kind);
        setError('');
        try {
            const token = await getToken();
            if (kind === 'create') { await createSquad(token, { name: name.trim() }); setName(''); }
            else { await joinSquad(token, code.trim()); setCode(''); }
            onDone();
        } catch (err) {
            setError(errorMessage(err, kind === 'create' ? 'Could not create the squad.' : 'Could not join.'));
        } finally {
            setBusy('');
        }
    };
    return (
        <section className={`${card} grid gap-5 p-5 md:grid-cols-2`} aria-label="Start or join a squad">
            <form onSubmit={(e) => { e.preventDefault(); run('create'); }}>
                <label htmlFor="sq-name" className={label}>Start a squad</label>
                <div className="flex gap-2">
                    <input id="sq-name" className={input} value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="Night Owls" />
                    <button type="submit" className={primaryButton} disabled={!name.trim() || !!busy}>{busy === 'create' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Plus className="h-4 w-4" aria-hidden="true" />} Start</button>
                </div>
            </form>
            <form onSubmit={(e) => { e.preventDefault(); run('join'); }}>
                <label htmlFor="sq-code" className={label}>Join with a code</label>
                <div className="flex gap-2">
                    <input id="sq-code" className={`${input} font-mono tracking-widest`} value={code} maxLength={10} onChange={(e) => setCode(e.target.value)} placeholder="abc234" autoCapitalize="none" />
                    <button type="submit" className={secondaryButton} disabled={code.trim().length < 4 || !!busy}>{busy === 'join' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <KeyRound className="h-4 w-4" aria-hidden="true" />} Join</button>
                </div>
            </form>
            <div className="md:col-span-2"><ErrorNote text={error} /></div>
        </section>
    );
}

function SquadCard({ squad, getToken, onChange }: { squad: SquadView; getToken: () => Promise<string | null>; onChange: () => void }) {
    const [copied, setCopied] = useState(false);
    const [note, setNote] = useState('');
    const [busy, setBusy] = useState('');
    const lit = squad.flameToday;

    const nudge = async (to: string, name: string) => {
        setBusy(to);
        try { await nudgeSquadmate(await getToken(), squad.id, to); setNote(`Nudged ${name}. They will see it in their companion.`); }
        catch (err) { setNote(errorMessage(err, 'Could not nudge.')); }
        finally { setBusy(''); }
    };

    return (
        <article className={`${card} overflow-hidden`}>
            <div className={`flex items-center justify-between gap-3 p-5 ${lit ? 'bg-gradient-to-br from-orange-500 to-rose-600 text-white' : ''}`}>
                <div className="min-w-0">
                    <h2 className={`truncate text-lg font-bold ${lit ? '' : 'text-slate-900 dark:text-white'}`}>{squad.name}</h2>
                    <p className={`text-xs ${lit ? 'text-white/90' : 'text-slate-600 dark:text-slate-400'}`}>
                        {squad.fromClass && <><School className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />Formed by your mentor · </>}
                        {lit ? 'Everyone practised today. The flame is lit.' : `${squad.members.filter((m) => m.activeToday).length} of ${squad.members.length} practised today`}
                    </p>
                </div>
                <div className="flex flex-col items-center">
                    <Flame className={`h-9 w-9 ${lit ? 'text-yellow-200 drop-shadow' : 'text-slate-400 dark:text-slate-600'}`} aria-hidden="true" />
                    <span className={`text-sm font-bold tabular-nums ${lit ? '' : 'text-slate-900 dark:text-white'}`}>{squad.streak} day{squad.streak === 1 ? '' : 's'}</span>
                </div>
            </div>

            <div className="space-y-4 p-5">
                <div>
                    <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Last 14 days</p>
                    <ol className="flex gap-1" aria-label="Days the whole squad practised">
                        {squad.last14.map((d) => (
                            <li key={d.day} title={`${d.day}: ${d.active}/${squad.members.length} active`} className={`h-7 flex-1 rounded-md ${d.all ? 'bg-orange-500' : d.active ? 'bg-orange-200 dark:bg-orange-500/30' : 'bg-slate-200 dark:bg-white/10'}`}>
                                <span className="sr-only">{d.day}: {d.all ? 'whole squad active' : `${d.active} active`}</span>
                            </li>
                        ))}
                    </ol>
                </div>

                <ul className="space-y-2">
                    {squad.members.map((m) => (
                        <li key={m.candidateId} className="flex items-center gap-3">
                            <Avatar name={m.name} />
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">{m.name}{m.me && <span className="font-normal text-slate-500"> (you)</span>}</p>
                                <p className="text-xs text-slate-600 dark:text-slate-400">{m.activeToday ? 'Practised today' : 'Not yet today'} · {m.streak}-day streak · {m.sessions14} sessions in 14 days</p>
                            </div>
                            {m.activeToday ? (
                                <Check className="h-5 w-5 text-emerald-600" aria-label="Active today" />
                            ) : !m.me ? (
                                <button className={iconButton} onClick={() => nudge(m.candidateId, m.name)} disabled={busy === m.candidateId} aria-label={`Nudge ${m.name}`} title="Nudge">
                                    {busy === m.candidateId ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <BellRing className="h-4 w-4" aria-hidden="true" />}
                                </button>
                            ) : null}
                        </li>
                    ))}
                </ul>
                {note && <p className="text-sm text-slate-700 dark:text-slate-300" role="status">{note}</p>}

                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200/70 pt-3 dark:border-white/5">
                    {squad.members.length < 4 ? (
                        <button className={secondaryButton} onClick={async () => { try { await navigator.clipboard.writeText(squad.code); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* clipboard blocked */ } }}>
                            {copied ? <Check className="h-4 w-4" aria-hidden="true" /> : <Clipboard className="h-4 w-4" aria-hidden="true" />} Invite code <span className="font-mono">{squad.code}</span>
                        </button>
                    ) : <span className="text-xs text-slate-500 dark:text-slate-400">Squad is full</span>}
                    <button className={secondaryButton} onClick={async () => { if (window.confirm(`Leave ${squad.name}?`)) { await leaveSquad(await getToken(), squad.id); onChange(); } }}>
                        <LogOut className="h-4 w-4" aria-hidden="true" /> Leave
                    </button>
                </div>
            </div>
        </article>
    );
}
