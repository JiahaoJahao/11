'use strict';

const { normalizeUrl, softTitleKey, sha1 } = require('./utils');
const { buildDraft, xIntentUrl } = require('./draft');

/**
 * Hard-dedupe media candidates by URL + content hash.
 * Soft-similar titles only marked.
 */
function dedupeMedia(candidates) {
  const seenUrl = new Set();
  const seenHash = new Set();
  const out = [];

  for (const c of candidates || []) {
    const url = normalizeUrl(c.url);
    const hash = c.hash || sha1(`${url}|${c.title || ''}`);
    const hardDup = (url && seenUrl.has(url)) || seenHash.has(hash);
    if (hardDup) continue;
    if (url) seenUrl.add(url);
    seenHash.add(hash);

    const softKey = softTitleKey(c.title || c.caption || '');
    const softSimilar = out.some((x) => softTitleKey(x.title || x.caption || '') === softKey && softKey);
    out.push({
      ...c,
      url,
      hash,
      softSimilar: softSimilar || false,
    });
  }
  return out;
}

/**
 * Merge same hotspot into one main card with appended updates.
 */
function mergeEvents(rawItems) {
  const groups = new Map();

  for (const item of rawItems) {
    const key = eventKey(item);
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(item);
  }

  const cards = [];
  for (const [, members] of groups) {
    members.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
    const primary = members[0];
    const updates = members.slice(1).map((m) => ({
      id: m.id,
      title: m.title,
      summary: m.summary,
      publishedAt: m.publishedAt,
      sourceName: m.sourceName,
      url: m.url,
      layer: m.layer,
    }));

    const mediaCandidates = dedupeMedia(
      members.flatMap((m) => {
        const base = [{ url: m.url, title: m.title, kind: 'link', source: m.sourceName }];
        return [...base, ...(m.media || [])];
      })
    );

    const draft = buildDraft(primary);
    cards.push({
      id: primary.id,
      eventKey: eventKey(primary),
      title: primary.title,
      summary: primary.summary,
      publishedAt: primary.publishedAt,
      region: primary.region,
      layer: primary.layer,
      dirty: !!(primary.dirty || primary.layer === 'DIRTY'),
      sourceName: primary.sourceName,
      sourceChain: draft.text.split('\n').find((l) => l.startsWith('来源链：'))?.replace('来源链：', '') || primary.sourceName,
      url: primary.url,
      mediaCandidates,
      updates,
      draft: draft.text,
      draftMeta: draft,
      xIntentUrl: xIntentUrl(draft.text),
      celebrityHeat: primary.celebrityHeat || null,
      type: primary.type,
    });
  }

  cards.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
  return cards;
}

function eventKey(item) {
  // Prefer soft title key + region; include coarse hour bucket for freshness
  const hour = Math.floor(new Date(item.publishedAt).getTime() / (60 * 60 * 1000));
  return `${item.region || 'x'}|${softTitleKey(item.title)}|${hour}`;
}

module.exports = {
  mergeEvents,
  dedupeMedia,
  eventKey,
};
