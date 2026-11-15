'use strict';

const Parser = require('rss-parser');
const { sha1, normalizeUrl, ageMinutesFromNow, parseDate, isDemoUrl } = require('./utils');

const rssParser = new Parser({
  headers: {
    'User-Agent': 'TufaJianting/1.0 (+local desktop listener)',
    Accept: 'application/rss+xml, application/xml, text/xml, */*',
  },
});

const DEFAULT_TIMEOUT_MS = 12000;

async function fetchText(url, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        'User-Agent': 'TufaJianting/1.0 (+local desktop listener)',
        Accept: 'application/rss+xml, application/xml, text/xml, application/json, */*',
      },
      redirect: 'follow',
    });
    if (!res.ok) {
      const err = new Error(`HTTP ${res.status} for ${url}`);
      err.status = res.status;
      throw err;
    }
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}

async function fetchJson(url, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const text = await fetchText(url, timeoutMs);
  return JSON.parse(text);
}

function withTimeout(promise, ms, label) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      const err = new Error(`超时 ${ms}ms: ${label}`);
      err.status = 408;
      reject(err);
    }, ms);
    promise.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      }
    );
  });
}

function baseItem(source, partial) {
  const publishedAt = partial.publishedAt || new Date();
  const url = normalizeUrl(partial.url || source.url || '');
  const demo =
    source.type === 'mock' ||
    !!source.placeholder ||
    !!partial.demo ||
    isDemoUrl(url);
  return {
    id: sha1(`${source.id}|${url}|${partial.title || ''}|${publishedAt.toISOString()}`),
    title: partial.title || '(无标题)',
    summary: partial.summary || partial.title || '',
    url,
    publishedAt: publishedAt.toISOString(),
    region: partial.region || source.region || 'overseas',
    layer: source.layer,
    sourceId: source.id,
    sourceName: source.name,
    dirty: !!(source.dirty || source.layer === 'DIRTY'),
    type: source.type,
    demo,
    placeholder: !!source.placeholder,
    media: partial.media || [],
    celebrity: partial.celebrity,
    gossip: !!partial.gossip,
    forcePass: !!partial.forcePass,
  };
}

async function collectRss(source) {
  const xml = await fetchText(source.url, DEFAULT_TIMEOUT_MS);
  const feed = await withTimeout(rssParser.parseString(xml), 8000, `parse ${source.id}`);
  const items = [];
  for (const entry of feed.items || []) {
    const publishedAt =
      parseDate(entry.isoDate) ||
      parseDate(entry.pubDate) ||
      parseDate(entry.published) ||
      null;
    // 无可靠时间戳的条目：不伪造「刚刚」，避免绕过 3 小时规则；记为略早于阈值边缘由 filter 丢弃
    if (!publishedAt) continue;
    items.push(
      baseItem(source, {
        title: entry.title,
        summary: stripHtml(entry.contentSnippet || entry.content || entry.summary || ''),
        url: entry.link || entry.guid,
        publishedAt,
        media: extractEnclosure(entry),
      })
    );
  }
  return items;
}

function extractEnclosure(entry) {
  const media = [];
  if (entry.enclosure && entry.enclosure.url) {
    media.push({
      url: entry.enclosure.url,
      title: entry.title,
      kind: entry.enclosure.type || 'enclosure',
      source: 'enclosure',
    });
  }
  return media;
}

function stripHtml(html) {
  return String(html || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function collectQuake(source) {
  const data = await fetchJson(source.url);
  const features = data.features || [];
  return features.map((f) => {
    const p = f.properties || {};
    const mag = p.mag;
    const place = p.place || 'unknown';
    const when = p.time ? new Date(p.time) : new Date();
    return baseItem(source, {
      title: `地震 M${mag} — ${place}`,
      summary: `USGS 报告震级 ${mag}，地点 ${place}。公开地震数据，属脏源线索。`,
      url: p.url || `https://earthquake.usgs.gov/earthquakes/eventpage/${f.id}`,
      publishedAt: when,
      forcePass: true,
      media: [],
    });
  });
}

async function collectMock(source) {
  return (source.mockItems || []).map((m) =>
    baseItem(source, {
      title: m.title,
      summary: m.summary,
      url: m.url,
      publishedAt: ageMinutesFromNow(m.ageMinutes || 30),
      region: m.region || source.region,
      celebrity: m.celebrity,
      gossip: m.gossip,
      forcePass: source.layer === 'L5' || source.dirty,
    })
  );
}

async function collectSource(source) {
  if (!source.enabled) return { sourceId: source.id, items: [], error: null, skipped: true };
  try {
    let items = [];
    const work = async () => {
      if (source.type === 'rss') return collectRss(source);
      if (source.type === 'quake') return collectQuake(source);
      if (source.type === 'mock') return collectMock(source);
      return [];
    };
    items = await withTimeout(work(), DEFAULT_TIMEOUT_MS + 5000, source.id);
    return { sourceId: source.id, items, error: null, skipped: false };
  } catch (err) {
    return {
      sourceId: source.id,
      items: [],
      error: {
        message: err.message || String(err),
        status: err.status || null,
      },
      skipped: false,
    };
  }
}

/** Collect many sources with limited concurrency. */
async function collectAll(sources, concurrency = 4) {
  const results = new Array(sources.length);
  let idx = 0;

  async function worker() {
    while (idx < sources.length) {
      const i = idx++;
      results[i] = await collectSource(sources[i]);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, Math.max(1, sources.length)) }, () =>
    worker()
  );
  await Promise.all(workers);
  return results;
}

module.exports = {
  collectSource,
  collectAll,
  collectRss,
  collectQuake,
  collectMock,
  fetchJson,
};
