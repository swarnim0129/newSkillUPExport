const XP_RULES = {
  roadmap_saved: 5,
  roadmap_node_completed: 100,
  roadmap_completed: 150,
  tutor_chapter_completed: 20,
  quiz_completed: 10,
  resume_analyzed: 15,
  resume_generated: 12,
  resume_exported: 8,
  interview_completed: 35,
  application_sent: 8,
  dsa_solved: 20,
};

const CREDIT_AWARDS = {
  roadmap_completed: 5,
};

function normalizeDifficultyLabel(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return null;

  if (['beginner', 'easy', 'basic', 'foundation', 'intro'].includes(raw)) return 'beginner';
  if (['intermediate', 'medium', 'mid'].includes(raw)) return 'intermediate';
  if (['advanced', 'hard'].includes(raw)) return 'advanced';
  if (['expert', 'very_hard', 'very-hard', 'pro'].includes(raw)) return 'expert';
  return null;
}

function getDifficultyMultiplier(difficultyLabel) {
  const label = normalizeDifficultyLabel(difficultyLabel);
  if (label === 'beginner') return 0.75;
  if (label === 'advanced') return 1.25;
  if (label === 'expert') return 1.5;
  return 1;
}

function getRoadmapNodeXp(metadata = {}) {
  const nodeBaseXp = XP_RULES.roadmap_node_completed;

  const resourcesCountRaw = Number(metadata.resourcesCount || metadata.videoCount || 0);
  const resourcesCount = Math.max(1, Number.isFinite(resourcesCountRaw) ? resourcesCountRaw : 1);

  const completedUnitsRaw = Number(metadata.completedVideoCount || metadata.completedUnits || resourcesCount);
  const completedUnits = Math.max(1, Math.min(resourcesCount, Number.isFinite(completedUnitsRaw) ? completedUnitsRaw : resourcesCount));

  const perResourceXp = nodeBaseXp / resourcesCount;
  const completionRatioXp = perResourceXp * completedUnits;

  const nodeDifficulty = normalizeDifficultyLabel(metadata.nodeDifficulty)
    || normalizeDifficultyLabel(metadata.difficulty)
    || null;
  const roadmapDifficulty = normalizeDifficultyLabel(metadata.roadmapDifficulty) || null;

  const nodeMultiplier = getDifficultyMultiplier(nodeDifficulty || roadmapDifficulty || 'intermediate');
  const roadmapMultiplier = getDifficultyMultiplier(roadmapDifficulty || nodeDifficulty || 'intermediate');
  const difficultyMultiplier = (nodeMultiplier + roadmapMultiplier) / 2;

  return Math.max(1, Math.round(completionRatioXp * difficultyMultiplier));
}

function getBaseXp(eventType, metadata = {}) {
  let base = XP_RULES[eventType] || 0;

  if (eventType === 'roadmap_node_completed') {
    base = getRoadmapNodeXp(metadata);
  }

  if (eventType === 'quiz_completed') {
    const score = Number(metadata.score || 0);
    const total = Number(metadata.total || 0);
    const ratio = total > 0 ? score / total : 0;
    if (ratio >= 0.9) base += 15;
    else if (ratio >= 0.7) base += 5;
  }

  return Math.max(0, base);
}

function getCreditAward(eventType) {
  return CREDIT_AWARDS[eventType] || 0;
}

function getLevelFromXp(xpTotal) {
  const xp = Math.max(0, Number(xpTotal || 0));
  return Math.floor(Math.sqrt(xp / 100)) + 1;
}

function getNextLevelXp(level) {
  const lvl = Math.max(1, Number(level || 1));
  return lvl * lvl * 100;
}

function getStreakMultiplier(currentStreak) {
  const streak = Math.max(0, Number(currentStreak || 0));
  if (streak >= 30) return 1.5;
  if (streak >= 14) return 1.35;
  if (streak >= 7) return 1.2;
  if (streak >= 3) return 1.1;
  return 1;
}

const BADGE_CATALOG = {
  first_step: { code: 'first_step', name: 'First Step' },
  on_fire_3: { code: 'on_fire_3', name: 'On Fire (3-day streak)' },
  on_fire_7: { code: 'on_fire_7', name: 'On Fire (7-day streak)' },
  roadmap_finisher: { code: 'roadmap_finisher', name: 'Roadmap Finisher' },
  quiz_ace: { code: 'quiz_ace', name: 'Quiz Ace' },
  all_rounder: { code: 'all_rounder', name: 'All-Rounder' },
  comeback_kid: { code: 'comeback_kid', name: 'Comeback Kid' },
};

module.exports = {
  XP_RULES,
  BADGE_CATALOG,
  getBaseXp,
  getCreditAward,
  getLevelFromXp,
  getNextLevelXp,
  getStreakMultiplier,
  getDifficultyMultiplier,
  normalizeDifficultyLabel,
};
