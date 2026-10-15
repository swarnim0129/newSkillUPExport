'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@clerk/nextjs';
import { QRCodeSVG } from 'qrcode.react';
import { Check, Copy, Download, Eye, ExternalLink, Globe, Loader2, Lock } from 'lucide-react';
import { errorMessage } from '@/lib/journeyApi';
import { getMyPassport, savePassport, type PassportSettings, type PassportView } from '@/lib/growApi';
import PassportCard from '@/components/grow/PassportCard';
import { card, ErrorNote, input, label, primaryButton, secondaryButton, Spinner } from '@/components/classroom/ui';

const SECTIONS: { key: keyof PassportSettings['show']; label: string }[] = [
    { key: 'journey', label: 'Degree, branch and goal' },
    { key: 'dsa', label: 'Problem solving (DSA)' },
    { key: 'subjects', label: 'Tested subjects' },
    { key: 'interviews', label: 'Mock interview scores' },
    { key: 'resume', label: 'Resume score' },
    { key: 'classes', label: 'Faculty classes and grades' },
];

export default function PassportPage() {
    const { getToken, isLoaded, isSignedIn } = useAuth();
    const [settings, setSettings] = useState<PassportSettings | null>(null);
    const [preview, setPreview] = useState<PassportView | null>(null);
    const [handle, setHandle] = useState('');
    const [headline, setHeadline] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const [copied, setCopied] = useState(false);
    const [origin, setOrigin] = useState('');

    const apply = (data: { settings: PassportSettings; preview: PassportView }) => {
        setSettings(data.settings);
        setPreview(data.preview);
        setHandle(data.settings.handle);
        setHeadline(data.settings.headline);
    };

    const load = useCallback(async () => {
        try {
            const data = await getMyPassport(await getToken());
            apply(data);
            setOrigin(window.location.origin);
        } catch (err) {
            setError(errorMessage(err, 'Could not load your passport.'));
        }
    }, [getToken]);
    useEffect(() => { if (isLoaded && isSignedIn) void Promise.resolve().then(load); }, [isLoaded, isSignedIn, load]);

    const save = async (body: Partial<Omit<PassportSettings, 'views'>>) => {
        setBusy(true);
        setError('');
        try { apply(await savePassport(await getToken(), body)); } catch (err) { setError(errorMessage(err, 'Could not save.')); } finally { setBusy(false); }
    };

    if (!settings || !preview) return error ? <ErrorNote text={error} /> : <Spinner label="Loading your passport" />;
    const link = `${origin}/passport/${settings.handle}`;

    const copy = async () => {
        try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { setCopied(false); }
    };
    const downloadQr = () => {
        const svg = document.getElementById('passport-qr');
        if (!svg) return;
        const blob = new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `skillup-passport-${settings.handle}.svg`;
        a.click();
        URL.revokeObjectURL(a.href);
    };

    return (
        <div className="space-y-5 pb-10">
            <div>
                <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-3xl">Skill passport</h1>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">A public page where every skill is backed by results recorded on SkillUp. Put the QR code on your resume; recruiters see proof, not claims.</p>
            </div>

            <div className="grid gap-5 lg:grid-cols-[22rem_minmax(0,1fr)]">
                <div className="space-y-5">
                    <section className={`${card} space-y-4 p-5`} aria-labelledby="share-heading">
                        <div className="flex items-center justify-between gap-3">
                            <h2 id="share-heading" className="text-base font-bold text-slate-900 dark:text-white">Sharing</h2>
                            <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${settings.enabled ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300' : 'bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-300'}`}>
                                {settings.enabled ? <Globe className="h-3.5 w-3.5" aria-hidden="true" /> : <Lock className="h-3.5 w-3.5" aria-hidden="true" />} {settings.enabled ? 'Public' : 'Private'}
                            </span>
                        </div>
                        <button className={settings.enabled ? secondaryButton : primaryButton} onClick={() => save({ enabled: !settings.enabled })} disabled={busy}>
                            {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />} {settings.enabled ? 'Make private' : 'Publish my passport'}
                        </button>

                        {settings.enabled && (
                            <>
                                <div className="flex justify-center rounded-2xl bg-white p-4 shadow-[var(--neu-inset)]">
                                    <QRCodeSVG id="passport-qr" value={link} size={168} level="M" marginSize={1} title={`QR code for ${link}`} />
                                </div>
                                <p className="break-all text-center text-xs text-slate-600 dark:text-slate-400">{link}</p>
                                <div className="grid grid-cols-3 gap-2">
                                    <button className={secondaryButton} onClick={copy} aria-label="Copy link">{copied ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}</button>
                                    <button className={secondaryButton} onClick={downloadQr} aria-label="Download QR code"><Download className="h-4 w-4" aria-hidden="true" /></button>
                                    <a className={secondaryButton} href={link} target="_blank" rel="noopener noreferrer" aria-label="Open public page"><ExternalLink className="h-4 w-4" aria-hidden="true" /></a>
                                </div>
                                <p className="flex items-center justify-center gap-1 text-xs text-slate-500 dark:text-slate-400"><Eye className="h-3.5 w-3.5" aria-hidden="true" /> {settings.views} view{settings.views === 1 ? '' : 's'}</p>
                            </>
                        )}
                    </section>

                    <section className={`${card} space-y-4 p-5`} aria-labelledby="edit-heading">
                        <h2 id="edit-heading" className="text-base font-bold text-slate-900 dark:text-white">What it shows</h2>
                        <div>
                            <label htmlFor="pp-headline" className={label}>Headline</label>
                            <input id="pp-headline" className={input} maxLength={140} value={headline} onChange={(e) => setHeadline(e.target.value)} onBlur={() => headline !== settings.headline && save({ headline })} placeholder="Electronics student moving into software" />
                        </div>
                        <div>
                            <label htmlFor="pp-handle" className={label}>Link</label>
                            <div className="flex items-center gap-1 text-sm text-slate-500 dark:text-slate-400">
                                <span className="flex-shrink-0">/passport/</span>
                                <input id="pp-handle" className={input} value={handle} maxLength={30} onChange={(e) => setHandle(e.target.value.toLowerCase())} onBlur={() => handle !== settings.handle && save({ handle })} />
                            </div>
                        </div>
                        <fieldset className="space-y-1">
                            <legend className={label}>Sections</legend>
                            {SECTIONS.map((sec) => (
                                <label key={sec.key} className="flex min-h-11 cursor-pointer items-center justify-between gap-3 text-sm text-slate-800 dark:text-slate-200">
                                    {sec.label}
                                    <input type="checkbox" className="h-5 w-5 accent-blue-600" checked={settings.show[sec.key]} onChange={(e) => save({ show: { ...settings.show, [sec.key]: e.target.checked } })} disabled={busy} />
                                </label>
                            ))}
                        </fieldset>
                        <ErrorNote text={error} />
                    </section>
                </div>

                <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Live preview</p>
                    <PassportCard passport={preview} />
                </div>
            </div>
        </div>
    );
}
