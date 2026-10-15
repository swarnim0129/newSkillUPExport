const Candidate = require('../models/Candidate');
const GamificationEvent = require('../models/GamificationEvent');
const UserActivity = require('../models/UserActivity');
const {
  BADGE_CATALOG,
  XP_RULES,
  getBaseXp,
  getCreditAward,
  getLevelFromXp,
  getNextLevelXp,
  getStreakMultiplier,
} = require('./gamificationRules');
const { deriveTopicCluster } = require('./topicClusterService');

const DAY_MS = 24 * 60 * 60 * 1000;
const STREAK_GRACE_HOURS = Number(process.env.STREAK_GRACE_HOURS || 30);

function toDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function dayStartUtc(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function getDayDiffUtc(a, b) {
  const aStart = dayStartUtc(a).getTime();
  const bStart = dayStartUtc(b).getTime();
  return Math.round((aStart - bStart) / DAY_MS);
}

function computeStreak(lastActiveAt, occurredAt, previousStreak) {
  const occurred = toDate(occurredAt) || new Date();
  const last = toDate(lastActiveAt);
  const prev = Math.max(0, Number(previousStreak || 0));

  if (!last) {
    return { before: prev, after: 1, comeback: false, occurred };
  }

  const diffDays = getDayDiffUtc(occurred, last);
  const diffHours = (occurred.getTime() - last.getTime()) / (60 * 60 * 1000);
  const isSameDay = diffDays <= 0;
  const withinGrace = diffHours <= STREAK_GRACE_HOURS;

  if (isSameDay) {
    return { before: prev, after: prev || 1, comeback: false, occurred };
  }

  // Next calendar day, or a late-night gap that skipped a day but stayed inside the grace window
  if (diffDays === 1 || withinGrace) {
    return { before: prev, after: prev + 1, comeback: false, occurred };
  }

  return { before: prev, after: 1, comeback: diffDays >= 3, occurred };
}

function hasBadge(candidate, code) {
  return Array.isArray(candidate.badges) && candidate.badges.some((b) => b.code === code);
}

function computeAllRounderUnlocked(candidate) {
  const s = candidate.gamificationStats || {};
  let modules = 0;
  if ((s.roadmapNodesCompleted || 0) > 0) modules += 1;
  if ((s.tutorChaptersCompleted || 0) > 0) modules += 1;
  if ((s.resumeAnalyses || 0) > 0 || (s.resumeGenerated || 0) > 0) modules += 1;
  if ((s.interviewsCompleted || 0) > 0) modules += 1;
  if ((s.applicationsSent || 0) > 0) modules += 1;
  return modules >= 4;
}

function evaluateBadges(candidate, eventType, metadata, streakAfter, comeback) {
  const unlocked = [];
  const maybeUnlock = (key) => {
    const badge = BADGE_CATALOG[key];
    if (!badge) return;
    if (hasBadge(candidate, badge.code)) return;
    unlocked.push({ code: badge.code, name: badge.name, unlockedAt: new Date(), meta: {} });
  };

  if (eventType === 'roadmap_node_completed') maybeUnlock('first_step');
  if (eventType === 'roadmap_completed') maybeUnlock('roadmap_finisher');
  if (streakAfter >= 3) maybeUnlock('on_fire_3');
  if (streakAfter >= 7) maybeUnlock('on_fire_7');
  if (eventType === 'quiz_completed') {
    const score = Number(metadata.score || 0);
    const total = Number(metadata.total || 0);
    if (total > 0 && score / total >= 0.9) {
      const aces = (candidate.gamificationStats && candidate.gamificationStats.quizAces) || 0;
      if (aces >= 3) maybeUnlock('quiz_ace');
    }
  }
  if (comeback) maybeUnlock('comeback_kid');
  if (computeAllRounderUnlocked(candidate)) maybeUnlock('all_rounder');

  return unlocked;
}

function getCounterKeyForEvent(eventType) {
  switch (eventType) {
    case 'roadmap_node_completed':
      return 'roadmapNodesCompleted';
    case 'roadmap_completed':
      return 'roadmapsCompleted';
    case 'tutor_chapter_completed':
      return 'tutorChaptersCompleted';
    case 'quiz_completed':
      return 'quizzesCompleted';
    case 'interview_completed':
      return 'interviewsCompleted';
    case 'resume_analyzed':
      return 'resumeAnalyses';
    case 'resume_generated':
      return 'resumeGenerated';
    case 'resume_exported':
      return 'resumeExports';
    case 'application_sent':
      return 'applicationsSent';
    default:
      return null;
  }
}

function getNextMultiplierMilestone(currentStreak) {
  const milestones = [
    { streak: 3, multiplier: 1.1 },
    { streak: 7, multiplier: 1.2 },
    { streak: 14, multiplier: 1.35 },
    { streak: 30, multiplier: 1.5 },
  ];
  return milestones.find((m) => currentStreak < m.streak) || null;
}

function buildCatchupSuggestions(xpGap, currentStreak) {
  const gap = Math.max(0, Number(xpGap || 0));
  if (gap <= 0) return [];

  const multiplier = getStreakMultiplier(currentStreak || 0);
  const options = [
    {
      action: 'Complete roadmap nodes',
      eventType: 'roadmap_node_completed',
      baseXp: XP_RULES.roadmap_node_completed,
    },
    {
      action: 'Finish tutor chapters',
      eventType: 'tutor_chapter_completed',
      baseXp: XP_RULES.tutor_chapter_completed,
    },
    {
      action: 'Ace quizzes (>=90%)',
      eventType: 'quiz_completed',
      baseXp: XP_RULES.quiz_completed + 15,
    },
    {
      action: 'Complete AI interviews',
      eventType: 'interview_completed',
      baseXp: XP_RULES.interview_completed,
    },
    {
      action: 'Analyze resume revisions',
      eventType: 'resume_analyzed',
      baseXp: XP_RULES.resume_analyzed,
    },
  ];

  return options
    .map((option) => {
      const estimatedXpPerAction = Math.max(1, Math.round(option.baseXp * multiplier));
      return {
        action: option.action,
        eventType: option.eventType,
        estimatedXpPerAction,
        estimatedCount: Math.ceil(gap / estimatedXpPerAction),
      };
    })
    .sort((a, b) => {
      if (a.estimatedCount === b.estimatedCount) return b.estimatedXpPerAction - a.estimatedXpPerAction;
      return a.estimatedCount - b.estimatedCount;
    })
    .slice(0, 3);
}

async function createActivityForBadges(candidateId, badgesUnlocked) {
  if (!Array.isArray(badgesUnlocked) || badgesUnlocked.length === 0) return;
  await Promise.all(
    badgesUnlocked.map((badge) =>
      UserActivity.create({
        candidate: candidateId,
        type: 'badge_unlocked',
        metadata: {
          title: 'Badge Unlocked',
          subtitle: `Unlocked \"${badge.name}\".`,
        },
      }).catch(() => null)
    )
  );
}

async function recordEvent(payload) {
  const {
    clerkId,
    eventType,
    source,
    sourceRef = {},
    topic,
    topicCluster,
    occurredAt,
    dedupeKey,
    metadata = {},
  } = payload;

  if (!clerkId) {
    throw new Error('clerkId is required');
  }
  if (!eventType) {
    throw new Error('eventType is required');
  }
  if (!source) {
    throw new Error('source is required');
  }
  if (!dedupeKey) {
    throw new Error('dedupeKey is required');
  }

  const existing = await GamificationEvent.findOne({ dedupeKey }).lean();
  if (existing) {
    const candidate = await Candidate.findById(existing.candidate)
      .select('xpTotal level currentStreak longestStreak lastActiveAt credits badges')
      .lean();
    return {
      duplicate: true,
      eventId: existing._id,
      xp: {
        base: existing.xpBase,
        multiplier: existing.xpMultiplier,
        awarded: existing.xpAwarded,
        totalXp: candidate?.xpTotal || 0,
        level: candidate?.level || 1,
        nextLevelXp: getNextLevelXp(candidate?.level || 1),
      },
      streak: {
        current: candidate?.currentStreak || 0,
        longest: candidate?.longestStreak || 0,
        lastActiveAt: candidate?.lastActiveAt || null,
      },
      badgesUnlocked: [],
      credits: {
        awarded: 0,
        total: candidate?.credits || 0,
      },
    };
  }

  const candidate = await Candidate.findOne({ clerkId });
  if (!candidate) {
    throw new Error('Candidate not found for clerkId');
  }

  const cluster = topicCluster || deriveTopicCluster(topic || metadata.topic);
  const streakResult = computeStreak(candidate.lastActiveAt, occurredAt, candidate.currentStreak);
  const xpBase = getBaseXp(eventType, metadata);
  const xpMultiplier = getStreakMultiplier(streakResult.after);
  const xpAwarded = Math.max(0, Math.round(xpBase * xpMultiplier));
  const creditsAwarded = getCreditAward(eventType);

  const levelBefore = candidate.level || 1;
  const streakBefore = candidate.currentStreak || 0;

  candidate.xpTotal = Math.max(0, (candidate.xpTotal || 0) + xpAwarded);
  candidate.level = getLevelFromXp(candidate.xpTotal);
  candidate.currentStreak = streakResult.after;
  candidate.longestStreak = Math.max(candidate.longestStreak || 0, streakResult.after);
  candidate.lastActiveAt = streakResult.occurred;
  candidate.weeklyXp = (candidate.weeklyXp || 0) + xpAwarded;

  if (creditsAwarded !== 0) {
    candidate.credits = (candidate.credits || 0) + creditsAwarded;
    candidate.totalCreditsEarned = (candidate.totalCreditsEarned || 0) + Math.max(creditsAwarded, 0);
  }

  if (!candidate.gamificationStats) {
    candidate.gamificationStats = {};
  }

  const counterKey = getCounterKeyForEvent(eventType);
  if (counterKey) {
    candidate.gamificationStats[counterKey] = (candidate.gamificationStats[counterKey] || 0) + 1;
  }

  if (eventType === 'quiz_completed') {
    const score = Number(metadata.score || 0);
    const total = Number(metadata.total || 0);
    if (total > 0 && score / total >= 0.9) {
      candidate.gamificationStats.quizAces = (candidate.gamificationStats.quizAces || 0) + 1;
    }
  }

  const badgesUnlocked = evaluateBadges(candidate, eventType, metadata, streakResult.after, streakResult.comeback);
  if (badgesUnlocked.length > 0) {
    candidate.badges = [...(candidate.badges || []), ...badgesUnlocked];
  }

  await candidate.save();

  const event = await GamificationEvent.create({
    candidate: candidate._id,
    clerkId,
    eventType,
    source,
    sourceRef,
    topic: topic || null,
    topicCluster: cluster,
    occurredAt: streakResult.occurred,
    xpBase,
    xpMultiplier,
    xpAwarded,
    creditsAwarded,
    streakBefore,
    streakAfter: candidate.currentStreak,
    levelBefore,
    levelAfter: candidate.level,
    badgesUnlocked: badgesUnlocked.map((b) => ({ code: b.code, name: b.name })),
    dedupeKey,
    metadata,
  });

  await createActivityForBadges(candidate._id, badgesUnlocked);

  return {
    duplicate: false,
    eventId: event._id,
    xp: {
      base: xpBase,
      multiplier: xpMultiplier,
      awarded: xpAwarded,
      totalXp: candidate.xpTotal,
      level: candidate.level,
      nextLevelXp: getNextLevelXp(candidate.level),
    },
    streak: {
      current: candidate.currentStreak,
      longest: candidate.longestStreak,
      lastActiveAt: candidate.lastActiveAt,
    },
    badgesUnlocked: badgesUnlocked.map((b) => ({ code: b.code, name: b.name, unlockedAt: b.unlockedAt })),
    credits: {
      awarded: creditsAwarded,
      total: candidate.credits || 0,
    },
  };
}

async function getGamificationSummary(clerkId, period = 'weekly') {
  const candidate = await Candidate.findOne({ clerkId }).lean();
  if (!candidate) {
    throw new Error('Candidate not found for clerkId');
  }

  const now = new Date();
  const periodStart = new Date(now);
  if (period === 'monthly') periodStart.setDate(periodStart.getDate() - 30);
  else periodStart.setDate(periodStart.getDate() - 7);

  const weeklyXpAgg = await GamificationEvent.aggregate([
    { $match: { candidate: candidate._id, occurredAt: { $gte: periodStart } } },
    { $group: { _id: null, total: { $sum: '$xpAwarded' } } },
  ]);

  return {
    profile: {
      xpTotal: candidate.xpTotal || 0,
      level: candidate.level || 1,
      currentStreak: candidate.currentStreak || 0,
      longestStreak: candidate.longestStreak || 0,
      weeklyXp: weeklyXpAgg[0]?.total || 0,
    },
    badges: (candidate.badges || []).sort((a, b) => new Date(b.unlockedAt).getTime() - new Date(a.unlockedAt).getTime()),
    stats: {
      roadmapsCompleted: candidate.gamificationStats?.roadmapsCompleted || 0,
      roadmapNodesCompleted: candidate.gamificationStats?.roadmapNodesCompleted || 0,
      tutorChaptersCompleted: candidate.gamificationStats?.tutorChaptersCompleted || 0,
      quizzesCompleted: candidate.gamificationStats?.quizzesCompleted || 0,
      interviewsCompleted: candidate.gamificationStats?.interviewsCompleted || 0,
      resumeAnalyses: candidate.gamificationStats?.resumeAnalyses || 0,
      applicationsSent: candidate.gamificationStats?.applicationsSent || 0,
    },
  };
}

async function getLeaderboard({ scope = 'global', period = 'weekly', topicCluster, limit = 20, meClerkId }) {
  const safeLimit = Math.max(1, Math.min(5000, Number(limit || 20)));
  const isTopicScoped = scope === 'topic' && !!topicCluster;

  const candidates = await Candidate.find({ status: { $ne: 'suspended' } })
    .select('_id clerkId firstName lastName level currentStreak xpTotal weeklyXp createdAt')
    .lean();

  if (!candidates.length) {
    return {
      entries: [],
      participants: 0,
      me: null,
      insights: null,
    };
  }

  // XP earned inside the period, summed from the event log so it resets on its own
  const periodXpMap = new Map();
  {
    const now = new Date();
    const start = new Date(now);
    if (period === 'monthly') start.setDate(start.getDate() - 30);
    else start.setDate(start.getDate() - 7);

    const match = { occurredAt: { $gte: start } };
    if (isTopicScoped) match.topicCluster = topicCluster;

    const periodAgg = await GamificationEvent.aggregate([
      { $match: match },
      {
        $group: {
          _id: '$candidate',
          xp: { $sum: '$xpAwarded' },
        },
      },
    ]);

    periodAgg.forEach((row) => {
      periodXpMap.set(String(row._id), Number(row.xp || 0));
    });
  }

  const rankedCandidates = candidates
    .map((candidate) => {
      const id = String(candidate._id);
      const first = String(candidate.firstName || '').trim();
      const last = String(candidate.lastName || '').trim();
      const displayName = `${first} ${last}`.trim() || 'Anonymous Learner';

      const xp = Number(periodXpMap.get(id) || 0);

      return {
        candidateId: id,
        clerkId: candidate.clerkId,
        name: displayName,
        xp,
        level: Number(candidate.level || 1),
        currentStreak: Number(candidate.currentStreak || 0),
        totalXp: Number(candidate.xpTotal || 0),
        createdAt: new Date(candidate.createdAt || 0).getTime(),
      };
    })
    .sort((a, b) => {
      if (b.xp !== a.xp) return b.xp - a.xp;
      if (b.totalXp !== a.totalXp) return b.totalXp - a.totalXp;
      if (b.level !== a.level) return b.level - a.level;
      if (b.currentStreak !== a.currentStreak) return b.currentStreak - a.currentStreak;
      return a.createdAt - b.createdAt;
    });

  const normalized = rankedCandidates.map((entry, index) => ({
    rank: index + 1,
    candidateId: entry.candidateId,
    name: entry.name,
    xp: entry.xp,
    level: entry.level,
    currentStreak: entry.currentStreak,
    isMe: !!meClerkId && entry.clerkId === meClerkId,
  }));

  const topEntries = normalized.slice(0, safeLimit);

  const meIndex = normalized.findIndex((e) => e.isMe);
  const meEntry = meIndex >= 0 ? normalized[meIndex] : null;
  const prevEntry = meIndex > 0 ? normalized[meIndex - 1] : null;
  const leaderEntry = normalized.length > 0 ? normalized[0] : null;

  const entriesWithMe = [...topEntries];
  if (meEntry && !entriesWithMe.some((entry) => entry.candidateId === meEntry.candidateId)) {
    entriesWithMe.push(meEntry);
  }

  const xpToNextRank = meEntry && prevEntry ? Math.max(0, prevEntry.xp - meEntry.xp + 1) : 0;
  const xpToLeader = meEntry && leaderEntry
    ? (leaderEntry.candidateId === meEntry.candidateId ? 0 : Math.max(0, leaderEntry.xp - meEntry.xp + 1))
    : 0;

  const nextRankSuggestions = meEntry && prevEntry
    ? buildCatchupSuggestions(xpToNextRank, meEntry.currentStreak)
    : [];

  const leaderSuggestions = meEntry && leaderEntry && leaderEntry.candidateId !== meEntry.candidateId
    ? buildCatchupSuggestions(xpToLeader, meEntry.currentStreak)
    : [];

  const nextMilestone = meEntry ? getNextMultiplierMilestone(meEntry.currentStreak) : null;

  return {
    entries: entriesWithMe,
    participants: normalized.length,
    me: meEntry
      ? {
          rank: meEntry.rank,
          xp: meEntry.xp,
          xpToNextRank,
          xpToLeader,
        }
      : null,
    insights: meEntry
      ? {
          toNextRank: prevEntry
            ? {
                targetName: prevEntry.name,
                targetRank: prevEntry.rank,
                xpGap: xpToNextRank,
                suggestions: nextRankSuggestions,
              }
            : null,
          toLeader: leaderEntry && leaderEntry.candidateId !== meEntry.candidateId
            ? {
                targetName: leaderEntry.name,
                targetRank: leaderEntry.rank,
                xpGap: xpToLeader,
                suggestions: leaderSuggestions,
              }
            : null,
          momentum: {
            currentStreak: meEntry.currentStreak,
            currentMultiplier: getStreakMultiplier(meEntry.currentStreak),
            nextMilestone,
          },
        }
      : null,
  };
}

function getBadgeCatalog() {
  return Object.values(BADGE_CATALOG);
}

module.exports = {
  recordEvent,
  getGamificationSummary,
  getLeaderboard,
  getBadgeCatalog,
};
