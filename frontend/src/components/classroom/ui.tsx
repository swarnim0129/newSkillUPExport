'use client';

import React, { useEffect, useId, useRef, useState } from 'react';
import {
    AlertTriangle,
    CheckCircle2,
    CircleDashed,
    Clock3,
    Code2,
    FileText,
    FlaskConical,
    ListChecks,
    Loader2,
    Megaphone,
    MessageCircleQuestion,
    MessageSquare,
    Mic,
    Pin,
    PinOff,
    Send,
    Target,
    Trash2,
    X,
    type LucideIcon,
} from 'lucide-react';
import type { ClassPost, WorkStatus, WorkType } from '@/lib/mentorApi';

// ─── Shared styles (Soft UI tokens, same as the journey pages) ──────────────

export const card = 'bg-white dark:bg-[var(--soft-surface)] rounded-2xl shadow-sm dark:shadow-black/20 border border-slate-200 dark:border-[var(--soft-line)]';
export const panel = 'rounded-xl border border-slate-200 dark:border-[var(--soft-line)] bg-slate-50 dark:bg-[var(--soft-sunken)]';
export const focusRing = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-black';
export const primaryButton = `inline-flex items-center justify-center gap-2 min-h-11 px-4 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors cursor-pointer ${focusRing}`;
export const secondaryButton = `inline-flex items-center justify-center gap-2 min-h-11 px-4 rounded-lg border border-slate-300 dark:border-[var(--soft-line)] bg-white dark:bg-transparent text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-[var(--soft-raised)] disabled:opacity-60 disabled:cursor-not-allowed transition-colors cursor-pointer ${focusRing}`;
export const dangerButton = `inline-flex items-center justify-center gap-2 min-h-11 px-4 rounded-lg border border-red-300 dark:border-red-800 text-sm font-semibold text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-60 disabled:cursor-not-allowed transition-colors cursor-pointer ${focusRing}`;
export const iconButton = `inline-flex items-center justify-center h-11 w-11 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-[var(--soft-raised)] hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer ${focusRing}`;
export const input = `w-full min-h-11 px-3 rounded-lg border border-slate-300 dark:border-[var(--soft-line)] bg-white dark:bg-[var(--soft-sunken)] text-slate-900 dark:text-white text-sm placeholder:text-slate-400 ${focusRing}`;
export const textarea = `w-full rounded-lg border border-slate-300 dark:border-[var(--soft-line)] bg-white dark:bg-[var(--soft-sunken)] p-3 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 ${focusRing}`;
export const label = 'mb-1.5 block text-sm font-medium text-slate-800 dark:text-slate-200';

// Class banner colours; white text on each passes WCAG AA
export const THEMES = [
    { name: 'Blue', banner: 'bg-blue-700', swatch: 'bg-blue-700' },
    { name: 'Teal', banner: 'bg-teal-700', swatch: 'bg-teal-700' },
    { name: 'Violet', banner: 'bg-violet-700', swatch: 'bg-violet-700' },
    { name: 'Amber', banner: 'bg-amber-700', swatch: 'bg-amber-700' },
    { name: 'Rose', banner: 'bg-rose-700', swatch: 'bg-rose-700' },
    { name: 'Slate', banner: 'bg-slate-700', swatch: 'bg-slate-700' },
];

export function themeOf(index: number | undefined) {
    return THEMES[index ?? 0] || THEMES[0];
}

export const WORK_TYPES: Record<WorkType, { label: string; icon: LucideIcon; hint: string }> = {
    dsa_problems: { label: 'DSA problems', icon: Code2, hint: 'Pick problems; done when all are solved in Practice.' },
    dsa_pattern: { label: 'DSA pattern level', icon: Target, hint: 'Done when the student reaches a level in one pattern.' },
    lab_subject: { label: 'Practice Lab', icon: FlaskConical, hint: 'Done when a Lab set in the subject scores above the bar.' },
    mock_interview: { label: 'Mock interview', icon: Mic, hint: 'Done when an AI mock interview scores above the bar.' },
    resume: { label: 'Resume score', icon: FileText, hint: 'Done when the resume analyzer scores above the bar.' },
    quiz: { label: 'Quiz', icon: ListChecks, hint: 'Multiple choice, one attempt, graded instantly.' },
    task: { label: 'Task', icon: CheckCircle2, hint: 'Students hand in a note or link; you grade it.' },
};

// Status always shows as icon plus words, never colour alone
const STATUS: Record<WorkStatus, { label: string; icon: LucideIcon; className: string }> = {
    assigned: { label: 'Assigned', icon: CircleDashed, className: 'text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-[var(--soft-raised)] border-slate-200 dark:border-[var(--soft-line)]' },
    in_progress: { label: 'In progress', icon: Clock3, className: 'text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800' },
    done: { label: 'Done', icon: CheckCircle2, className: 'text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800' },
    late: { label: 'Done late', icon: CheckCircle2, className: 'text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800' },
    missing: { label: 'Missing', icon: AlertTriangle, className: 'text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800' },
    returned: { label: 'Graded', icon: CheckCircle2, className: 'text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800' },
    returned_late: { label: 'Graded, late', icon: CheckCircle2, className: 'text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800' },
};

export function StatusPill({ status }: { status: WorkStatus }) {
    const s = STATUS[status] || STATUS.assigned;
    const Icon = s.icon;
    return (
        <span className={`inline-flex flex-shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold ${s.className}`}>
            <Icon className="h-3.5 w-3.5" aria-hidden="true" /> {s.label}
        </span>
    );
}

export function isDone(status: WorkStatus) {
    return status === 'done' || status === 'late' || status === 'returned' || status === 'returned_late';
}

export function formatDate(value: string | null | undefined) {
    if (!value) return '';
    return new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatDateTime(value: string | null | undefined) {
    if (!value) return '';
    return new Date(value).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function dueText(dueAt: string | null) {
    if (!dueAt) return 'No due date';
    const due = new Date(dueAt);
    const days = Math.round((due.getTime() - Date.now()) / 86400000);
    if (days < 0) return `Was due ${formatDate(dueAt)}`;
    if (days === 0) return 'Due today';
    if (days === 1) return 'Due tomorrow';
    return `Due ${formatDate(dueAt)}`;
}

export function timeAgo(value: string) {
    const minutes = Math.round((Date.now() - new Date(value).getTime()) / 60000);
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours} h ago`;
    const days = Math.round(hours / 24);
    if (days < 7) return `${days} d ago`;
    return formatDate(value);
}

export function Spinner({ label = 'Loading' }: { label?: string }) {
    return (
        <div className="flex min-h-[40vh] items-center justify-center" role="status">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600" aria-hidden="true" />
            <span className="sr-only">{label}</span>
        </div>
    );
}

export function ErrorNote({ text }: { text: string }) {
    if (!text) return null;
    return <p className="text-sm text-red-600 dark:text-red-400" role="alert">{text}</p>;
}

export function ProgressBar({ value, label: name }: { value: number; label: string }) {
    const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
    return (
        <div className="h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-[var(--soft-line)]" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={name}>
            <div className="h-full rounded-full bg-blue-600 dark:bg-blue-500 transition-[width] duration-300" style={{ width: `${pct}%` }} />
        </div>
    );
}

/** Accessible dialog: Escape and the backdrop close it, focus moves inside. */
export function Dialog({
    open,
    onClose,
    title,
    children,
    wide = false,
}: {
    open: boolean;
    onClose: () => void;
    title: string;
    children: React.ReactNode;
    wide?: boolean;
}) {
    const ref = useRef<HTMLDivElement>(null);
    const titleId = useId();

    useEffect(() => {
        if (!open) return;
        const previous = document.activeElement as HTMLElement | null;
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', onKey);
        document.body.style.overflow = 'hidden';
        const first = ref.current?.querySelector<HTMLElement>('input, textarea, select, button:not([data-close])');
        first?.focus();
        return () => {
            document.removeEventListener('keydown', onKey);
            document.body.style.overflow = '';
            previous?.focus?.();
        };
    }, [open, onClose]);

    if (!open) return null;
    return (
        <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center sm:p-4">
            <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
            <div
                ref={ref}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                className={`relative flex max-h-[92vh] w-full flex-col ${wide ? 'sm:max-w-3xl' : 'sm:max-w-lg'} rounded-t-2xl sm:rounded-2xl bg-white dark:bg-[var(--soft-surface)] border border-slate-200 dark:border-[var(--soft-line)] shadow-xl`}
            >
                <div className="flex items-center justify-between gap-3 border-b border-slate-200 dark:border-[var(--soft-line)] px-5 py-3">
                    <h2 id={titleId} className="text-lg font-bold text-slate-900 dark:text-white">{title}</h2>
                    <button type="button" data-close onClick={onClose} className={iconButton} aria-label="Close">
                        <X className="h-5 w-5" aria-hidden="true" />
                    </button>
                </div>
                <div className="overflow-y-auto px-5 py-4">{children}</div>
            </div>
        </div>
    );
}

/** Tab bar with arrow-key support. */
export function Tabs<T extends string>({
    tabs,
    value,
    onChange,
    label: name,
}: {
    tabs: { key: T; label: string; count?: number }[];
    value: T;
    onChange: (key: T) => void;
    label: string;
}) {
    const onKey = (e: React.KeyboardEvent, index: number) => {
        if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
        e.preventDefault();
        const next = tabs[(index + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
        onChange(next.key);
        (e.currentTarget.parentElement?.querySelector(`[data-tab="${next.key}"]`) as HTMLElement | null)?.focus();
    };
    return (
        <div role="tablist" aria-label={name} className="flex gap-1 overflow-x-auto border-b border-slate-200 dark:border-[var(--soft-line)]">
            {tabs.map((t, i) => {
                const active = t.key === value;
                return (
                    <button
                        key={t.key}
                        role="tab"
                        data-tab={t.key}
                        aria-selected={active}
                        tabIndex={active ? 0 : -1}
                        onClick={() => onChange(t.key)}
                        onKeyDown={(e) => onKey(e, i)}
                        className={`relative min-h-11 whitespace-nowrap px-4 text-sm font-semibold transition-colors cursor-pointer ${focusRing} ${active ? 'text-blue-700 dark:text-blue-400' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'}`}
                    >
                        {t.label}
                        {typeof t.count === 'number' && t.count > 0 && (
                            <span className="ml-1.5 rounded-full bg-blue-100 dark:bg-blue-900/40 px-1.5 py-0.5 text-[11px] font-bold text-blue-700 dark:text-blue-300">{t.count}</span>
                        )}
                        {active && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-blue-600 dark:bg-blue-400" aria-hidden="true" />}
                    </button>
                );
            })}
        </div>
    );
}

// ─── Stream ─────────────────────────────────────────────────────────────────

const POST_KIND: Record<ClassPost['kind'], { label: string; icon: LucideIcon; className: string }> = {
    announcement: { label: 'Announcement', icon: Megaphone, className: 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' },
    question: { label: 'Question', icon: MessageCircleQuestion, className: 'bg-violet-50 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300' },
    assignment: { label: 'New classwork', icon: ListChecks, className: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' },
};

function initials(name: string) {
    return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('') || '?';
}

export function Avatar({ name, mentor = false }: { name: string; mentor?: boolean }) {
    return (
        <span
            className={`inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold ${mentor ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-700 dark:bg-[var(--soft-raised)] dark:text-slate-200'}`}
            aria-hidden="true"
        >
            {initials(name)}
        </span>
    );
}

/**
 * The class stream, shared by mentor and student pages. What each viewer may
 * do (pin, delete) comes from the callbacks passed in.
 */
export function Stream({
    posts,
    composerLabel,
    composerPlaceholder,
    onPost,
    onComment,
    onDelete,
    canDelete,
    onPin,
    onOpenWork,
}: {
    posts: ClassPost[];
    composerLabel: string;
    composerPlaceholder: string;
    onPost: (text: string) => Promise<void>;
    onComment: (postId: string, text: string) => Promise<void>;
    onDelete?: (postId: string) => Promise<void>;
    canDelete: (post: ClassPost) => boolean;
    onPin?: (postId: string, pinned: boolean) => Promise<void>;
    onOpenWork?: (assignmentId: string) => void;
}) {
    const [text, setText] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const composerId = useId();

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!text.trim()) return;
        setBusy(true);
        setError('');
        try {
            await onPost(text.trim());
            setText('');
        } catch (err) {
            setError(err instanceof Error && err.message ? err.message : 'Could not post.');
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="space-y-4">
            <form onSubmit={submit} className={`${card} p-4`}>
                <label htmlFor={composerId} className={label}>{composerLabel}</label>
                <textarea
                    id={composerId}
                    rows={3}
                    maxLength={2000}
                    className={textarea}
                    placeholder={composerPlaceholder}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                />
                <ErrorNote text={error} />
                <div className="mt-2 flex justify-end">
                    <button type="submit" className={primaryButton} disabled={busy || !text.trim()}>
                        {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Send className="h-4 w-4" aria-hidden="true" />} Post
                    </button>
                </div>
            </form>

            {posts.length === 0 ? (
                <div className={`${card} p-8 text-center text-sm text-slate-600 dark:text-slate-400`}>
                    <MessageSquare className="mx-auto mb-2 h-7 w-7 text-blue-600 dark:text-blue-400" aria-hidden="true" />
                    Nothing here yet. Announcements, questions and new classwork show up in the stream.
                </div>
            ) : (
                <ul className="space-y-3" aria-label="Class stream">
                    {posts.map((post) => (
                        <li key={post.id}>
                            <PostCard
                                post={post}
                                onComment={onComment}
                                onDelete={onDelete && canDelete(post) ? onDelete : undefined}
                                onPin={onPin}
                                onOpenWork={onOpenWork}
                            />
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

function PostCard({
    post,
    onComment,
    onDelete,
    onPin,
    onOpenWork,
}: {
    post: ClassPost;
    onComment: (postId: string, text: string) => Promise<void>;
    onDelete?: (postId: string) => Promise<void>;
    onPin?: (postId: string, pinned: boolean) => Promise<void>;
    onOpenWork?: (assignmentId: string) => void;
}) {
    const [reply, setReply] = useState('');
    const [busy, setBusy] = useState(false);
    const [showAll, setShowAll] = useState(false);
    const replyId = useId();
    const kind = POST_KIND[post.kind];
    const KindIcon = kind.icon;
    const comments = showAll ? post.comments : post.comments.slice(-3);

    const send = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!reply.trim()) return;
        setBusy(true);
        try {
            await onComment(post.id, reply.trim());
            setReply('');
        } finally {
            setBusy(false);
        }
    };

    return (
        <article className={`${card} overflow-hidden`}>
            <div className="flex items-start gap-3 p-4">
                <Avatar name={post.authorName} mentor={post.authorType === 'mentor'} />
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="text-sm font-semibold text-slate-900 dark:text-white">{post.authorName}</span>
                        {post.authorType === 'mentor' && <span className="text-xs text-slate-500 dark:text-slate-400">Mentor</span>}
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${kind.className}`}>
                            <KindIcon className="h-3 w-3" aria-hidden="true" /> {kind.label}
                        </span>
                        {post.pinned && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                                <Pin className="h-3 w-3" aria-hidden="true" /> Pinned
                            </span>
                        )}
                        <span className="text-xs text-slate-500 dark:text-slate-400">· {timeAgo(post.createdAt)}</span>
                    </div>
                    <p className="mt-1.5 whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-800 dark:text-slate-200">{post.text}</p>
                    {post.kind === 'assignment' && post.assignmentId && onOpenWork && (
                        <button className={`${secondaryButton} mt-3`} onClick={() => onOpenWork(post.assignmentId!)}>
                            Open classwork
                        </button>
                    )}
                </div>
                <div className="flex flex-shrink-0">
                    {onPin && post.kind !== 'assignment' && (
                        <button className={iconButton} onClick={() => onPin(post.id, !post.pinned)} aria-label={post.pinned ? 'Unpin post' : 'Pin post'} title={post.pinned ? 'Unpin' : 'Pin to top'}>
                            {post.pinned ? <PinOff className="h-4 w-4" aria-hidden="true" /> : <Pin className="h-4 w-4" aria-hidden="true" />}
                        </button>
                    )}
                    {onDelete && (
                        <button
                            className={iconButton}
                            onClick={() => { if (window.confirm('Delete this post and its comments?')) onDelete(post.id); }}
                            aria-label="Delete post"
                            title="Delete"
                        >
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </button>
                    )}
                </div>
            </div>

            {(post.comments.length > 0 || post.kind !== 'assignment') && (
                <div className="border-t border-slate-200 dark:border-[var(--soft-line)] bg-slate-50/70 dark:bg-[var(--soft-sunken)] px-4 py-3">
                    {post.comments.length > 3 && !showAll && (
                        <button className={`mb-2 text-xs font-semibold text-blue-700 dark:text-blue-400 hover:underline ${focusRing}`} onClick={() => setShowAll(true)}>
                            Show all {post.comments.length} comments
                        </button>
                    )}
                    {comments.length > 0 && (
                        <ul className="mb-3 space-y-2.5">
                            {comments.map((c) => (
                                <li key={c.id} className="flex items-start gap-2.5">
                                    <Avatar name={c.authorName} mentor={c.authorType === 'mentor'} />
                                    <div className="min-w-0">
                                        <p className="text-xs">
                                            <span className="font-semibold text-slate-900 dark:text-white">{c.authorName}</span>
                                            {c.authorType === 'mentor' && <span className="text-slate-500 dark:text-slate-400"> · Mentor</span>}
                                            <span className="text-slate-500 dark:text-slate-400"> · {timeAgo(c.at)}</span>
                                        </p>
                                        <p className="whitespace-pre-wrap break-words text-sm text-slate-800 dark:text-slate-200">{c.text}</p>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}
                    <form onSubmit={send} className="flex items-center gap-2">
                        <label htmlFor={replyId} className="sr-only">Add a class comment</label>
                        <input
                            id={replyId}
                            className={input}
                            placeholder="Add a class comment"
                            maxLength={1000}
                            value={reply}
                            onChange={(e) => setReply(e.target.value)}
                        />
                        <button type="submit" className={iconButton} disabled={busy || !reply.trim()} aria-label="Send comment">
                            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Send className="h-4 w-4" aria-hidden="true" />}
                        </button>
                    </form>
                </div>
            )}
        </article>
    );
}

