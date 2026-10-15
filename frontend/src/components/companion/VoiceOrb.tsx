'use client';

import React from 'react';
import { Loader2, Mic, Square, Volume2 } from 'lucide-react';
import type { VoiceState } from '@/lib/useVoice';

const LABEL: Record<VoiceState, string> = {
    idle: 'Tap to talk',
    listening: 'Listening… tap to stop',
    thinking: 'Thinking…',
    speaking: 'Speaking… tap to stop',
};

/** The big talk button: a glass orb that pulses while listening and ripples while speaking. */
export default function VoiceOrb({ state, onTap, tone = 'blue', disabled = false, labels, level = 0 }: { state: VoiceState; onTap: () => void; tone?: 'blue' | 'amber'; disabled?: boolean; labels?: Partial<Record<VoiceState, string>>; level?: number }) {
    const text = { ...LABEL, ...(labels || {}) };
    const colour = tone === 'amber' ? 'from-amber-400 via-orange-500 to-rose-500' : 'from-sky-400 via-blue-600 to-violet-600';
    const glow = tone === 'amber' ? 'shadow-[0_20px_60px_-15px_rgb(249_115_22/0.7)]' : 'shadow-[0_20px_60px_-15px_rgb(37_99_235/0.75)]';
    const Icon = state === 'thinking' ? Loader2 : state === 'speaking' ? Volume2 : state === 'listening' ? Square : Mic;
    return (
        <div className="flex flex-col items-center gap-4">
            <div className="relative flex h-48 w-48 items-center justify-center">
                {(state === 'listening' || state === 'speaking') && (
                    <>
                        <span className={`absolute inset-0 rounded-full bg-gradient-to-br ${colour} opacity-25 motion-safe:animate-ping`} aria-hidden="true" />
                        <span className={`absolute inset-4 rounded-full bg-gradient-to-br ${colour} opacity-30 motion-safe:animate-pulse`} aria-hidden="true" />
                    </>
                )}
                <button
                    type="button"
                    onClick={onTap}
                    disabled={disabled || state === 'thinking'}
                    aria-label={text[state]}
                    style={{ transform: level ? `scale(${1 + Math.min(0.12, level * 0.25)})` : undefined }}
                    className={`relative flex h-36 w-36 items-center justify-center rounded-full bg-gradient-to-br ${colour} text-white ${glow} ring-8 ring-white/40 transition-transform duration-200 hover:scale-[1.03] active:scale-95 disabled:cursor-not-allowed disabled:opacity-70 cursor-pointer focus-visible:outline-none focus-visible:ring-blue-300 dark:ring-white/10`}
                >
                    <span className="absolute inset-3 rounded-full bg-white/15 backdrop-blur-sm" aria-hidden="true" />
                    <Icon className={`relative h-12 w-12 ${state === 'thinking' ? 'animate-spin' : ''}`} aria-hidden="true" />
                </button>
            </div>
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-200" aria-live="polite">{text[state]}</p>
        </div>
    );
}
