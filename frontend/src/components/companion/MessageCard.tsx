'use client';

import React from 'react';
import Link from 'next/link';
import {
    AlertTriangle,
    ArrowRight,
    BookMarked,
    CalendarClock,
    CheckCircle2,
    Clock3,
    Info,
    Milestone,
    PartyPopper,
    Pencil,
    Plus,
    School,
    Sparkles,
    Target,
    Trash2,
    UserCheck,
    Phone,
    type LucideIcon,
} from 'lucide-react';
import type { CompanionAction, CompanionMessage, CompanionWidget, PlanChange } from '@/lib/journeyApi';
import { toolLink } from '@/lib/toolLinks';

const focusRing = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-black';
const inner = 'rounded-xl border border-white/70 bg-white/60 dark:border-white/5 dark:bg-white/[0.04]';

function formatTime(value: string) {
    return new Date(value).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function formatDate(value: string) {
    return new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

const KIND: Record<CompanionMessage['kind'], { label: string; icon: LucideIcon } | null> = {
    chat: null,
    checkin: { label: 'Weekly check-in', icon: CalendarClock },
    welcome: { label: 'Welcome', icon: Sparkles },
    mentor: { label: 'From your mentor', icon: UserCheck },
    voice: { label: 'Voice call', icon: Phone },
};

/** Words to read out loud for a message: the headline, the points and the next step. */
export function speechOf(message: Pick<CompanionMessage, 'content' | 'widgets'>): string {
    const widgets = message.widgets || [];
    if (!widgets.length) return message.content.replace(/\*\*/g, '').slice(0, 900);
    const parts: string[] = [];
    widgets.forEach((w) => {
        if (w.type === 'headline') parts.push([w.title, w.text].filter(Boolean).join('. '));
        else if (w.type === 'points') parts.push(w.items.slice(0, 3).join('. '));
        else if (w.type === 'alert') parts.push(w.text);
        else if (w.type === 'next') parts.push(`${w.title}: ${w.text}`);
        else if (w.type === 'transcript') return;
        else if (w.type === 'plan_changes') parts.push(`I changed ${w.items.length} thing${w.items.length > 1 ? 's' : ''} in your plan.`);
    });
    return parts.filter(Boolean).join('. ').replace(/\.\./g, '.').slice(0, 900);
}

/** One message in the companion chat: the student's bubble, or the companion's card stack. */
export default function MessageCard({ message, speaker }: { message: CompanionMessage; speaker?: { name: string; icon: LucideIcon; tone: 'blue' | 'violet' | 'amber' } }) {
    const mine = message.role === 'user';
    const kind = KIND[message.kind];

    if (mine) {
        return (
            <div className="flex justify-end">
                <div className="max-w-[85%] sm:max-w-[70%]">
                    <p className="mb-1 text-right text-xs text-slate-500 dark:text-slate-400">
                        You · <time dateTime={message.createdAt}>{formatTime(message.createdAt)}</time>
                    </p>
                    <div className="whitespace-pre-wrap rounded-2xl rounded-br-md bg-blue-600 px-4 py-2.5 text-sm leading-relaxed text-white shadow-[0_8px_18px_-8px_rgb(37_99_235/0.6)]">
                        {message.content}
                    </div>
                </div>
            </div>
        );
    }

    const KindIcon = kind?.icon;
    const widgets = message.widgets && message.widgets.length ? message.widgets : null;
    const isMentor = message.kind === 'mentor';
    const tone = speaker ? speaker.tone : isMentor ? 'violet' : 'blue';
    const SpeakerIcon = speaker ? speaker.icon : isMentor ? UserCheck : Sparkles;
    const AVATAR = { blue: 'bg-blue-600', violet: 'bg-violet-600', amber: 'bg-amber-500' };
    const BUBBLE = {
        blue: 'border-white/70 bg-white/55 dark:border-white/5 dark:bg-[rgb(22_29_46/0.6)]',
        violet: 'border-violet-200/80 bg-violet-50/70 dark:border-violet-400/20 dark:bg-violet-500/10',
        amber: 'border-amber-200/80 bg-amber-50/70 dark:border-amber-400/20 dark:bg-amber-500/10',
    };

    return (
        <div className="flex justify-start gap-3">
            <span
                className={`mt-6 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl text-white shadow-[0_6px_14px_-6px_rgb(37_99_235/0.7)] ${AVATAR[tone]}`}
                aria-hidden="true"
            >
                <SpeakerIcon className="h-4.5 w-4.5" />
            </span>
            <div className="min-w-0 max-w-[92%] flex-1 sm:max-w-[80%]">
                <p className="mb-1 flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                    <span className="font-semibold text-slate-700 dark:text-slate-300">{speaker ? speaker.name : isMentor ? 'Mentor' : 'Companion'}</span>
                    {kind && KindIcon && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 font-semibold text-blue-700 dark:bg-blue-500/15 dark:text-blue-300">
                            <KindIcon className="h-3 w-3" aria-hidden="true" /> {kind.label}
                        </span>
                    )}
                    · <time dateTime={message.createdAt}>{formatTime(message.createdAt)}</time>
                </p>
                <div
                    className={`space-y-3 rounded-2xl rounded-tl-md border p-4 backdrop-blur-xl shadow-[var(--neu-raise-sm)] ${BUBBLE[tone]}`}
                >
                    {widgets ? widgets.map((w, i) => <Widget key={i} widget={w} />) : <RichText text={message.content} />}
                    {message.actions?.length > 0 && <Actions actions={message.actions} />}
                </div>
            </div>
        </div>
    );
}

function Widget({ widget }: { widget: CompanionWidget }) {
    switch (widget.type) {
        case 'headline':
            return (
                <div>
                    {widget.title && <h3 className="text-base font-bold leading-snug text-slate-900 dark:text-white">{widget.title}</h3>}
                    {widget.text && <p className="mt-1 text-sm leading-relaxed text-slate-700 dark:text-slate-300">{widget.text}</p>}
                </div>
            );
        case 'points':
            return (
                <div>
                    {widget.title && <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{widget.title}</p>}
                    {widget.style === 'steps' ? (
                        <ol className="space-y-2">
                            {widget.items.map((item, i) => (
                                <li key={i} className="flex items-start gap-2.5 text-sm leading-relaxed text-slate-800 dark:text-slate-200">
                                    <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-blue-600 text-[11px] font-bold text-white">{i + 1}</span>
                                    <span>{item}</span>
                                </li>
                            ))}
                        </ol>
                    ) : (
                        <ul className="space-y-1.5">
                            {widget.items.map((item, i) => (
                                <li key={i} className="flex items-start gap-2.5 text-sm leading-relaxed text-slate-800 dark:text-slate-200">
                                    <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-blue-600 dark:text-blue-400" aria-hidden="true" />
                                    <span>{item}</span>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            );
        case 'stats':
            return (
                <dl className="grid grid-cols-3 gap-2">
                    {widget.items.map((s) => (
                        <div key={s.label} className={`${inner} px-3 py-2 shadow-[var(--neu-inset)]`}>
                            <dt className="text-[11px] font-medium text-slate-600 dark:text-slate-400">{s.label}</dt>
                            <dd className="text-xl font-bold tabular-nums text-slate-900 dark:text-white">{s.value}</dd>
                            {s.hint && <dd className="text-[11px] leading-tight text-slate-500 dark:text-slate-400">{s.hint}</dd>}
                        </div>
                    ))}
                </dl>
            );
        case 'milestones':
            return (
                <div>
                    <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{widget.title}</p>
                    <ul className="space-y-1.5">
                        {widget.items.map((m) => {
                            const link = toolLink(m.tool, m.toolTopic);
                            return (
                                <li key={m.id}>
                                    <Link href={link.href} className={`${inner} flex min-h-11 items-center justify-between gap-3 px-3 py-2 hover:bg-white/90 dark:hover:bg-white/[0.08] ${focusRing}`}>
                                        <span className="flex min-w-0 items-start gap-2">
                                            {m.origin === 'mentor' ? (
                                                <School className="mt-0.5 h-4 w-4 flex-shrink-0 text-violet-600 dark:text-violet-400" aria-hidden="true" />
                                            ) : m.overdue ? (
                                                <Clock3 className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
                                            ) : (
                                                <Milestone className="mt-0.5 h-4 w-4 flex-shrink-0 text-blue-600 dark:text-blue-400" aria-hidden="true" />
                                            )}
                                            <span className="min-w-0">
                                                <span className="block truncate text-sm font-medium text-slate-900 dark:text-white">{m.title}</span>
                                                <span className={`block text-xs ${m.overdue ? 'font-semibold text-amber-700 dark:text-amber-300' : 'text-slate-500 dark:text-slate-400'}`}>
                                                    {m.overdue ? 'Past due' : 'Due'} {formatDate(m.dueAt)}
                                                </span>
                                            </span>
                                        </span>
                                        <ArrowRight className="h-4 w-4 flex-shrink-0 text-slate-400" aria-hidden="true" />
                                    </Link>
                                </li>
                            );
                        })}
                    </ul>
                </div>
            );
        case 'alert': {
            const tone = {
                warn: { icon: AlertTriangle, className: 'border-amber-200 bg-amber-50/80 text-amber-900 dark:border-amber-400/20 dark:bg-amber-500/10 dark:text-amber-200' },
                info: { icon: Info, className: 'border-blue-200 bg-blue-50/80 text-slate-800 dark:border-blue-400/20 dark:bg-blue-500/10 dark:text-slate-200' },
                good: { icon: PartyPopper, className: 'border-emerald-200 bg-emerald-50/80 text-emerald-900 dark:border-emerald-400/20 dark:bg-emerald-500/10 dark:text-emerald-200' },
            }[widget.tone] || { icon: Info, className: '' };
            const Icon = tone.icon;
            return (
                <p className={`flex items-start gap-2 rounded-xl border px-3 py-2 text-sm leading-relaxed ${tone.className}`}>
                    <Icon className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" /> <span>{widget.text}</span>
                </p>
            );
        }
        case 'next': {
            const link = toolLink(widget.tool, widget.toolTopic);
            return (
                <div className="flex flex-col gap-2 rounded-xl border border-blue-200 bg-gradient-to-br from-blue-50/90 to-white/70 p-3 dark:border-blue-400/20 dark:from-blue-500/15 dark:to-transparent sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 items-start gap-2">
                        <Target className="mt-0.5 h-4 w-4 flex-shrink-0 text-blue-600 dark:text-blue-400" aria-hidden="true" />
                        <div className="min-w-0">
                            <p className="text-xs font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-300">{widget.title}</p>
                            <p className="text-sm font-medium text-slate-900 dark:text-white">{widget.text}</p>
                        </div>
                    </div>
                    <Link href={link.href} className={`inline-flex min-h-11 flex-shrink-0 items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-3 text-sm font-semibold text-white hover:bg-blue-700 ${focusRing}`}>
                        {link.label} <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </Link>
                </div>
            );
        }
        case 'plan_changes':
            return <PlanChanges items={widget.items} />;
        case 'transcript':
            return (
                <details className={`${inner} p-3`}>
                    <summary className={`min-h-9 cursor-pointer text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400 ${focusRing}`}>Call transcript ({widget.items.length} lines)</summary>
                    <ul className="mt-2 space-y-1.5 text-sm">
                        {widget.items.map((l, i) => (
                            <li key={i}><span className="font-semibold text-slate-900 dark:text-white">{l.role === 'user' ? 'You' : 'Companion'}:</span> <span className="text-slate-700 dark:text-slate-300">{l.text}</span></li>
                        ))}
                    </ul>
                </details>
            );
        default:
            return null;
    }
}

const CHANGE: Record<PlanChange['action'], { label: string; icon: LucideIcon }> = {
    add: { label: 'Added', icon: Plus },
    remove: { label: 'Removed', icon: Trash2 },
    move: { label: 'Moved', icon: CalendarClock },
    update: { label: 'Updated', icon: Pencil },
    complete: { label: 'Done', icon: CheckCircle2 },
    skip: { label: 'Dropped', icon: Trash2 },
    mode: { label: 'Mode', icon: Sparkles },
};

function PlanChanges({ items }: { items: PlanChange[] }) {
    return (
        <div className={`${inner} p-3`}>
            <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                <Milestone className="h-3.5 w-3.5" aria-hidden="true" /> Your plan changed
            </p>
            <ul className="space-y-1.5">
                {items.map((c, i) => {
                    const meta = CHANGE[c.action] || CHANGE.update;
                    const Icon = meta.icon;
                    return (
                        <li key={i} className="flex items-start gap-2 text-sm">
                            <span className="inline-flex flex-shrink-0 items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700 dark:bg-white/10 dark:text-slate-300">
                                <Icon className="h-3 w-3" aria-hidden="true" /> {meta.label}
                            </span>
                            <span className="min-w-0 text-slate-800 dark:text-slate-200">
                                {c.title}
                                {c.detail && <span className="block text-xs text-slate-500 dark:text-slate-400">{c.detail}</span>}
                            </span>
                        </li>
                    );
                })}
            </ul>
            <Link href="/candidate/journey" className={`mt-2 inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-blue-700 hover:underline dark:text-blue-400 ${focusRing}`}>
                See my plan <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
        </div>
    );
}

const ACTIONS: Record<CompanionAction['type'], { label: string; icon: LucideIcon }> = {
    plan_changed: { label: 'Plan changed', icon: Milestone },
    goal_changed: { label: 'Goal changed', icon: Target },
    remembered: { label: 'Remembered', icon: BookMarked },
};

function Actions({ actions }: { actions: CompanionAction[] }) {
    // Plan changes already have their own card; show only what else happened
    const rest = actions.filter((a) => a.type !== 'plan_changed');
    if (!rest.length) return null;
    return (
        <ul className="flex flex-wrap gap-1.5">
            {rest.map((a, i) => {
                const meta = ACTIONS[a.type];
                const Icon = meta.icon;
                return (
                    <li key={i} className="inline-flex max-w-full items-start gap-1.5 rounded-full border border-slate-200 bg-white/70 px-2.5 py-1 text-xs text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-slate-300">
                        <Icon className="mt-0.5 h-3 w-3 flex-shrink-0 text-blue-600 dark:text-blue-400" aria-hidden="true" />
                        <span className="min-w-0"><span className="font-semibold">{meta.label}:</span> {a.summary}</span>
                    </li>
                );
            })}
        </ul>
    );
}

/**
 * Older messages (and mentor notes) are plain text. Show them readably:
 * paragraphs, "- " bullets, "1." steps and **bold**, without rendering HTML.
 */
export function RichText({ text }: { text: string }) {
    const blocks = String(text || '').split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
    return (
        <div className="space-y-2.5 text-sm leading-relaxed text-slate-800 dark:text-slate-200">
            {blocks.map((block, i) => {
                const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
                const bullets = lines.every((l) => /^[-•*]\s+/.test(l));
                const steps = lines.every((l) => /^\d+[.)]\s+/.test(l));
                if (bullets || steps) {
                    const List = steps ? 'ol' : 'ul';
                    return (
                        <List key={i} className={`space-y-1 pl-5 ${steps ? 'list-decimal' : 'list-disc'} marker:text-blue-600`}>
                            {lines.map((l, j) => <li key={j}>{inline(l.replace(/^([-•*]|\d+[.)])\s+/, ''))}</li>)}
                        </List>
                    );
                }
                return <p key={i} className="whitespace-pre-wrap">{inline(block)}</p>;
            })}
        </div>
    );
}

function inline(text: string) {
    return text.split(/(\*\*[^*]+\*\*|"[^"\n]{3,90}")/g).map((part, i) => {
        if (/^\*\*[^*]+\*\*$/.test(part)) return <strong key={i} className="font-semibold text-slate-900 dark:text-white">{part.slice(2, -2)}</strong>;
        // Quoted milestone titles stand out a little
        if (/^"[^"]+"$/.test(part)) return <span key={i} className="font-medium text-slate-900 dark:text-white">{part}</span>;
        return <React.Fragment key={i}>{part}</React.Fragment>;
    });
}
