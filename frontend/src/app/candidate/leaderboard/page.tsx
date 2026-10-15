'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@clerk/nextjs';
import { Trophy, Flame, ArrowLeft, RefreshCw, Target, Rocket } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import api from '@/lib/api';

type LeaderboardEntry = {
  rank: number;
  candidateId: string;
  name: string;
  xp: number;
  level: number;
  currentStreak: number;
  isMe: boolean;
};

type InsightSuggestion = {
  action: string;
  eventType: string;
  estimatedXpPerAction: number;
  estimatedCount: number;
};

type LeaderboardResponse = {
  success: boolean;
  entries: LeaderboardEntry[];
  participants?: number;
  me?: {
    rank: number;
    xp: number;
    xpToNextRank: number;
    xpToLeader: number;
  } | null;
  insights?: {
    toNextRank?: {
      targetName: string;
      targetRank: number;
      xpGap: number;
      suggestions: InsightSuggestion[];
    } | null;
    toLeader?: {
      targetName: string;
      targetRank: number;
      xpGap: number;
      suggestions: InsightSuggestion[];
    } | null;
    momentum?: {
      currentStreak: number;
      currentMultiplier: number;
      nextMilestone: { streak: number; multiplier: number } | null;
    };
  } | null;
};

export default function CandidateLeaderboardPage() {
  const { getToken } = useAuth();
  const router = useRouter();
  const params = useSearchParams();

  const topicCluster = params.get('topicCluster') || '';
  const period = (params.get('period') || 'weekly') as 'weekly' | 'monthly';
  const scope = (params.get('scope') || (topicCluster ? 'topic' : 'global')) as 'topic' | 'global';

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<LeaderboardResponse | null>(null);

  const title = useMemo(() => {
    if (scope === 'topic') {
      return `Topic League${topicCluster ? ` - ${topicCluster}` : ''}`;
    }
    return 'Global Leaderboard';
  }, [scope, topicCluster]);

  const loadLeaderboard = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getToken();
      const res = await api.get<LeaderboardResponse>('/gamification/leaderboard', {
        params: {
          scope,
          period,
          topicCluster: scope === 'topic' ? topicCluster : undefined,
          limit: 20,
        },
        headers: { Authorization: `Bearer ${token}` },
      });
      setData(res.data);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to load leaderboard');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLeaderboard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, period, topicCluster]);

  return (
    <div className="min-h-full space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <button
            onClick={() => router.back()}
            className="mb-2 inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-900 dark:text-neutral-400 dark:hover:text-white"
          >
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">{title}</h1>
          <p className="text-sm text-slate-500 dark:text-neutral-400 mt-1">
            {data?.participants ?? 0} active learners in this {period} window.
          </p>
        </div>

        <button
          onClick={loadLeaderboard}
          disabled={loading}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-60 dark:bg-neutral-100 dark:text-black dark:hover:bg-white"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 bg-white dark:bg-[var(--soft-sunken)] border border-slate-200 dark:border-neutral-800 rounded-2xl p-4 sm:p-5">
          <div className="flex items-center gap-2 mb-4">
            <Trophy className="w-5 h-5 text-amber-500" />
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">Rankings</h2>
          </div>

          <div className="space-y-2">
            {(data?.entries || []).map((entry) => (
              <div
                key={`${entry.candidateId}-${entry.rank}`}
                className={`flex items-center justify-between rounded-xl border px-3 py-3 ${entry.isMe
                  ? 'border-cyan-300 bg-cyan-50 dark:border-cyan-500/40 dark:bg-cyan-500/10'
                  : 'border-slate-200 bg-slate-50 dark:border-neutral-800 dark:bg-neutral-900'
                  }`}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-slate-500 dark:text-neutral-400">#{entry.rank}</span>
                    <span className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                      {entry.name}{entry.isMe ? ' (You)' : ''}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500 dark:text-neutral-400 mt-1">
                    Level {entry.level} • {entry.currentStreak} day streak
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-extrabold text-emerald-600 dark:text-emerald-400">{entry.xp} XP</div>
                </div>
              </div>
            ))}

            {!loading && (data?.entries || []).length === 0 && (
              <p className="text-sm text-slate-500 dark:text-neutral-400">No leaderboard entries yet.</p>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div className="bg-white dark:bg-[var(--soft-sunken)] border border-slate-200 dark:border-neutral-800 rounded-2xl p-4 sm:p-5">
            <div className="flex items-center gap-2 mb-3">
              <Target className="w-5 h-5 text-cyan-500" />
              <h3 className="font-bold text-slate-900 dark:text-white">Surpass Next Rank</h3>
            </div>
            {data?.insights?.toNextRank ? (
              <div className="space-y-2 text-sm">
                <p className="text-slate-600 dark:text-neutral-300">
                  Beat <span className="font-semibold">{data.insights.toNextRank.targetName}</span> (#{data.insights.toNextRank.targetRank}) by gaining
                  <span className="font-semibold"> {data.insights.toNextRank.xpGap} XP</span>.
                </p>
                {(data.insights.toNextRank.suggestions || []).map((s, i) => (
                  <div key={`${s.eventType}-${i}`} className="rounded-lg border border-slate-200 dark:border-neutral-800 px-3 py-2 bg-slate-50 dark:bg-neutral-900">
                    <p className="font-medium text-slate-800 dark:text-white">{s.action}</p>
                    <p className="text-xs text-slate-500 dark:text-neutral-400">~{s.estimatedXpPerAction} XP each • do ~{s.estimatedCount}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500 dark:text-neutral-400">You are currently at the top or not ranked yet.</p>
            )}
          </div>

          <div className="bg-white dark:bg-[var(--soft-sunken)] border border-slate-200 dark:border-neutral-800 rounded-2xl p-4 sm:p-5">
            <div className="flex items-center gap-2 mb-3">
              <Rocket className="w-5 h-5 text-emerald-500" />
              <h3 className="font-bold text-slate-900 dark:text-white">Chase Leader</h3>
            </div>
            {data?.insights?.toLeader ? (
              <div className="space-y-2 text-sm">
                <p className="text-slate-600 dark:text-neutral-300">
                  To overtake the leader, gain
                  <span className="font-semibold"> {data.insights.toLeader.xpGap} XP</span>.
                </p>
                {(data.insights.toLeader.suggestions || []).map((s, i) => (
                  <div key={`${s.eventType}-${i}`} className="rounded-lg border border-slate-200 dark:border-neutral-800 px-3 py-2 bg-slate-50 dark:bg-neutral-900">
                    <p className="font-medium text-slate-800 dark:text-white">{s.action}</p>
                    <p className="text-xs text-slate-500 dark:text-neutral-400">~{s.estimatedXpPerAction} XP each • do ~{s.estimatedCount}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500 dark:text-neutral-400">No leader chase insight yet.</p>
            )}
          </div>

          <div className="bg-white dark:bg-[var(--soft-sunken)] border border-slate-200 dark:border-neutral-800 rounded-2xl p-4 sm:p-5">
            <div className="flex items-center gap-2 mb-2">
              <Flame className="w-5 h-5 text-orange-500" />
              <h3 className="font-bold text-slate-900 dark:text-white">Momentum</h3>
            </div>
            <p className="text-sm text-slate-600 dark:text-neutral-300">
              Current streak: <span className="font-semibold">{data?.insights?.momentum?.currentStreak ?? 0} days</span>
              {' '}• Multiplier: <span className="font-semibold">x{data?.insights?.momentum?.currentMultiplier ?? 1}</span>
            </p>
            {data?.insights?.momentum?.nextMilestone && (
              <p className="text-xs text-slate-500 dark:text-neutral-400 mt-1">
                Reach {data.insights.momentum.nextMilestone.streak} days to unlock x{data.insights.momentum.nextMilestone.multiplier} XP multiplier.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
