'use strict';

const { withinHours } = require('./utils');

function textBlob(item) {
  return [item.title, item.summary, item.sourceName].filter(Boolean).join(' ');
}

function matchesAny(text, words) {
  const lower = String(text || '').toLowerCase();
  return (words || []).some((w) => {
    const needle = String(w || '').toLowerCase();
    return needle && lower.includes(needle);
  });
}

function isBlacklisted(item, keywords) {
  const blob = textBlob(item);
  const zh = (keywords.blacklist && keywords.blacklist.zh) || [];
  const en = (keywords.blacklist && keywords.blacklist.en) || [];
  return matchesAny(blob, zh) || matchesAny(blob, en);
}

function isWhitelisted(item, keywords) {
  // Official / quake / dirty public feeds often pass without keyword hit
  if (item.forcePass) return true;
  if (item.layer === 'L2' || item.type === 'quake') return true;
  if (item.gossip) return true;

  const blob = textBlob(item);
  const zh = (keywords.whitelist && keywords.whitelist.zh) || [];
  const en = (keywords.whitelist && keywords.whitelist.en) || [];
  return matchesAny(blob, zh) || matchesAny(blob, en);
}

/**
 * Apply max-age, blacklist (hard hide), whitelist.
 */
function filterItems(items, { maxAgeHours = 3, keywords }) {
  const kept = [];
  const stats = { tooOld: 0, blacklisted: 0, notWhitelisted: 0 };

  for (const item of items) {
    if (!withinHours(item.publishedAt, maxAgeHours)) {
      stats.tooOld += 1;
      continue;
    }
    if (isBlacklisted(item, keywords)) {
      stats.blacklisted += 1;
      continue;
    }
    if (!isWhitelisted(item, keywords)) {
      stats.notWhitelisted += 1;
      continue;
    }
    kept.push(item);
  }

  return { items: kept, stats };
}

module.exports = {
  filterItems,
  isBlacklisted,
  isWhitelisted,
  matchesAny,
};
