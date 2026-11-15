'use strict';

const { clamp } = require('./utils');

/**
 * Celebrity heat scoring (US/EU + CN).
 * Weights (default): volume7d 40 + followers 25 + trend 20 + spread 15.
 * Missing external APIs → local/heuristic replaceable implementation.
 *
 * volume7d: heuristic from mention density in title/summary (0–40)
 * followers: mapped from seed table or guessed (0–25)
 * trend: seed trendBoost or keyword heat (0–20)
 * spread: seed spread or gossip flag (0–15)
 */
function scoreCelebrityHeat(item, settings, keywords) {
  const weights = (settings && settings.celebrityWeights) || {
    volume7d: 40,
    followers: 25,
    trend: 20,
    spread: 15,
  };
  const threshold = (settings && settings.celebrityHeatThreshold) || 60;
  const seed = (keywords && keywords.celebritySeed) || {};

  const name = item.celebrity || detectCelebrityName(item, seed);
  const profile = name && seed[name] ? seed[name] : null;

  const blob = `${item.title || ''} ${item.summary || ''}`;
  const mentionHits = countMentions(blob, name);
  const volume7d = clamp(Math.round((mentionHits / 3) * weights.volume7d), 0, weights.volume7d);

  let followersScore = 8;
  if (profile && typeof profile.followersM === 'number') {
    followersScore = clamp(Math.round((profile.followersM / 100) * weights.followers), 0, weights.followers);
  }

  let trendScore = item.gossip ? 10 : 5;
  if (profile && typeof profile.trendBoost === 'number') {
    trendScore = clamp(profile.trendBoost, 0, weights.trend);
  }

  let spreadScore = item.gossip ? 10 : 4;
  if (profile && typeof profile.spread === 'number') {
    spreadScore = clamp(profile.spread, 0, weights.spread);
  }

  const total = volume7d + followersScore + trendScore + spreadScore;
  return {
    name: name || null,
    score: total,
    threshold,
    pass: total >= threshold,
    breakdown: {
      volume7d,
      followers: followersScore,
      trend: trendScore,
      spread: spreadScore,
    },
    note: '本地启发式评分；可替换为外部声量/粉丝 API',
  };
}

function detectCelebrityName(item, seed) {
  if (item.celebrity) return item.celebrity;
  const blob = `${item.title || ''} ${item.summary || ''}`;
  for (const name of Object.keys(seed || {})) {
    if (blob.includes(name)) return name;
  }
  return null;
}

function countMentions(text, name) {
  if (!name) return 1;
  const re = new RegExp(escapeRegExp(name), 'gi');
  const m = String(text).match(re);
  return m ? m.length : 1;
}

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Filter L4 gossip: keep only if heat passes threshold (or non-gossip). */
function applyCelebrityGate(items, settings, keywords) {
  return items
    .map((item) => {
      if (item.layer !== 'L4' && !item.gossip) return item;
      const heat = scoreCelebrityHeat(item, settings, keywords);
      return { ...item, celebrityHeat: heat };
    })
    .filter((item) => {
      if (item.layer !== 'L4' && !item.gossip) return true;
      if (!item.celebrityHeat) return true;
      return item.celebrityHeat.pass;
    });
}

module.exports = {
  scoreCelebrityHeat,
  applyCelebrityGate,
};
