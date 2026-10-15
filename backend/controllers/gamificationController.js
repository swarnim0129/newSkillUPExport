const {
  recordEvent,
  getGamificationSummary,
  getLeaderboard,
  getBadgeCatalog,
} = require('../services/gamificationService');

exports.postEvent = async (req, res) => {
  try {
    if (String(process.env.GAMIFICATION_ENABLED || 'true').toLowerCase() === 'false') {
      return res.status(200).json({ success: true, skipped: true, reason: 'disabled' });
    }

    const {
      eventType,
      source,
      sourceRef,
      topic,
      topicCluster,
      dedupeKey,
      metadata,
    } = req.body || {};

    // Only events that cannot be proven server-side may be reported by the browser.
    // Roadmap, resume, interview and application events are recorded by their own controllers.
    const CLIENT_EVENT_TYPES = ['tutor_chapter_completed', 'quiz_completed'];
    if (!CLIENT_EVENT_TYPES.includes(eventType)) {
      return res.status(403).json({ success: false, message: 'This event type cannot be reported by the client' });
    }
    if (!dedupeKey || typeof dedupeKey !== 'string') {
      return res.status(400).json({ success: false, message: 'dedupeKey is required' });
    }

    const result = await recordEvent({
      clerkId: req.clerkId,
      eventType,
      source,
      sourceRef,
      topic,
      topicCluster,
      // occurredAt is always server time so streaks cannot be backdated
      dedupeKey: `${eventType}:${req.clerkId}:${dedupeKey}`,
      metadata,
    });

    return res.status(200).json({
      success: true,
      duplicate: !!result.duplicate,
      eventId: result.eventId,
      xp: result.xp,
      streak: result.streak,
      badgesUnlocked: result.badgesUnlocked,
      credits: result.credits,
    });
  } catch (error) {
    console.error('[gamification/postEvent] Error:', error);
    return res.status(500).json({ success: false, message: error.message || 'Internal server error' });
  }
};

exports.getMe = async (req, res) => {
  try {
    const period = req.query.period || process.env.LEADERBOARD_DEFAULT_PERIOD || 'weekly';
    const data = await getGamificationSummary(req.clerkId, period);
    return res.status(200).json({ success: true, ...data });
  } catch (error) {
    console.error('[gamification/getMe] Error:', error);
    return res.status(500).json({ success: false, message: error.message || 'Internal server error' });
  }
};

exports.getLeaderboard = async (req, res) => {
  try {
    const scope = req.query.scope || 'global';
    const period = req.query.period || process.env.LEADERBOARD_DEFAULT_PERIOD || 'weekly';
    const topicCluster = req.query.topicCluster || undefined;
    const limit = Number(req.query.limit || 20);

    const data = await getLeaderboard({
      scope,
      period,
      topicCluster,
      limit,
      meClerkId: req.clerkId,
    });

    return res.status(200).json({
      success: true,
      scope,
      period,
      topicCluster: topicCluster || null,
      entries: data.entries,
      participants: data.participants,
      me: data.me,
      insights: data.insights,
    });
  } catch (error) {
    console.error('[gamification/getLeaderboard] Error:', error);
    return res.status(500).json({ success: false, message: error.message || 'Internal server error' });
  }
};

exports.getBadges = async (_req, res) => {
  try {
    return res.status(200).json({ success: true, badges: getBadgeCatalog() });
  } catch (error) {
    console.error('[gamification/getBadges] Error:', error);
    return res.status(500).json({ success: false, message: error.message || 'Internal server error' });
  }
};
