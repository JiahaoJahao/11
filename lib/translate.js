'use strict';

/**
 * Auto-localize overseas English title/summary/draft to Chinese.
 * Keeps originals for collapsible display; marks failures.
 */

const cache = new Map();

/** Offline fallbacks for known mock / common demo strings */
const PHRASE_MAP = {
  'Breaking: major highway pile-up reported near LA':
    '突发：洛杉矶附近传出严重连环追尾',
  'Witness accounts of multi-vehicle crash; traffic halted. Unverified social tip.':
    '目击者称多车相撞，交通中断。社交线索，未经核实。',
  'Celebrity court update: high-profile star released from jail':
    '娱乐司法动态：知名明星出狱',
  'Gossip outlets claim a US celebrity was released after short detention. Heat score applied.':
    '八卦媒体称某美国明星短暂羁押后获释。已套用热度分。',
  'Eyewitness: explosion heard downtown, smoke visible':
    '目击者：市中心传出爆炸声，可见浓烟',
  'Geo-tagged posts mention blast and emergency response. Newer than wire copy.':
    '带定位帖文提及爆炸与应急响应，比通讯社稿件更新。',
};

function hasCjk(text) {
  return /[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff]/.test(String(text || ''));
}

function latinRatio(text) {
  const s = String(text || '');
  if (!s.trim()) return 0;
  const letters = s.replace(/[^A-Za-z]/g, '');
  const cjk = (s.match(/[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff]/g) || []).length;
  if (cjk >= 4) return 0;
  return letters.length / Math.max(s.replace(/\s/g, '').length, 1);
}

/** True when text looks primarily English / Latin and should be translated. */
function needsZh(text) {
  const s = String(text || '').trim();
  if (!s) return false;
  if (hasCjk(s) && latinRatio(s) < 0.45) return false;
  return latinRatio(s) >= 0.35 || /^[A-Za-z0-9]/.test(s) && !hasCjk(s);
}

function cacheKey(text) {
  return String(text || '').trim().slice(0, 800);
}

async function fetchJson(url, timeoutMs = 8000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { Accept: 'application/json', 'User-Agent': 'tufa-jianting/1.0' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

async function translateViaMyMemory(text) {
  const q = encodeURIComponent(String(text).slice(0, 450));
  const data = await fetchJson(
    `https://api.mymemory.translated.net/get?q=${q}&langpair=en|zh-CN`
  );
  const out = data && data.responseData && data.responseData.translatedText;
  if (!out || typeof out !== 'string') throw new Error('empty translation');
  // MyMemory returns same text or ERROR messages on quota
  if (/^MYMEMORY WARNING/i.test(out) || /^QUERY LENGTH LIMIT/i.test(out)) {
    throw new Error(out.slice(0, 80));
  }
  return out.trim();
}

async function translateViaGoogleGtx(text) {
  const q = encodeURIComponent(String(text).slice(0, 900));
  const url =
    `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=zh-CN&dt=t&q=${q}`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!Array.isArray(data) || !Array.isArray(data[0])) throw new Error('bad gtx payload');
    const joined = data[0].map((part) => (part && part[0]) || '').join('');
    if (!joined.trim()) throw new Error('empty gtx');
    return joined.trim();
  } finally {
    clearTimeout(t);
  }
}

/**
 * @returns {{ text: string, status: 'ok'|'skipped'|'failed', error?: string }}
 */
async function translateToZh(text) {
  const raw = String(text || '').trim();
  if (!raw) return { text: '', status: 'skipped' };
  if (!needsZh(raw)) return { text: raw, status: 'skipped' };

  const key = cacheKey(raw);
  if (cache.has(key)) return cache.get(key);

  if (PHRASE_MAP[raw]) {
    const hit = { text: PHRASE_MAP[raw], status: 'ok' };
    cache.set(key, hit);
    return hit;
  }

  let result;
  try {
    let zh;
    try {
      zh = await translateViaGoogleGtx(raw);
    } catch {
      zh = await translateViaMyMemory(raw);
    }
    // If "translation" identical and still Latin-heavy, treat as failed
    if (zh === raw && needsZh(zh)) {
      throw new Error('translator returned source text');
    }
    result = { text: zh, status: 'ok' };
  } catch (err) {
    result = {
      text: raw,
      status: 'failed',
      error: err.message || String(err),
    };
  }

  cache.set(key, result);
  return result;
}

async function mapLimited(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx], idx);
    }
  }
  const n = Math.min(limit, items.length) || 1;
  await Promise.all(Array.from({ length: n }, () => worker()));
  return out;
}

/**
 * Localize one card in place (returns new object).
 * Default display fields become Chinese; originals kept for UI collapse.
 */
async function localizeCard(card, buildDraft, xIntentUrl) {
  const titleRes = await translateToZh(card.title);
  const summaryRes = await translateToZh(card.summary);

  const anyFail = titleRes.status === 'failed' || summaryRes.status === 'failed';
  const anyOk = titleRes.status === 'ok' || summaryRes.status === 'ok';
  const anyNeed =
    needsZh(card.title) || needsZh(card.summary) || needsZh(card.draft);

  const titleZh = titleRes.status === 'failed' ? card.title : titleRes.text;
  const summaryZh = summaryRes.status === 'failed' ? card.summary : summaryRes.text;

  const localizedBase = {
    ...card,
    title: titleZh,
    summary: summaryZh,
  };

  let draftText = card.draft;
  let draftMeta = card.draftMeta;
  if (typeof buildDraft === 'function') {
    draftMeta = buildDraft(localizedBase);
    draftText = draftMeta.text;
  } else if (needsZh(card.draft)) {
    const draftRes = await translateToZh(card.draft);
    if (draftRes.status === 'ok') draftText = draftRes.text;
    if (draftRes.status === 'failed') {
      // keep English draft but flag failure
    }
  }

  const updates = await mapLimited(card.updates || [], 3, async (u) => {
    const tr = await translateToZh(u.title);
    return {
      ...u,
      titleOriginal: tr.status === 'skipped' ? null : u.title,
      title: tr.status === 'failed' ? u.title : tr.text,
      translationStatus: tr.status,
    };
  });

  const mediaCandidates = await mapLimited(card.mediaCandidates || [], 3, async (m) => {
    if (!m.title || !needsZh(m.title)) return m;
    const tr = await translateToZh(m.title);
    return {
      ...m,
      titleOriginal: m.title,
      title: tr.status === 'failed' ? m.title : tr.text,
      translationStatus: tr.status,
    };
  });

  let translationStatus = 'skipped';
  if (anyFail) translationStatus = 'failed';
  else if (anyOk || (anyNeed && !anyFail)) translationStatus = 'ok';
  else if (anyNeed) translationStatus = 'failed';

  return {
    ...localizedBase,
    titleOriginal: needsZh(card.title) ? card.title : null,
    summaryOriginal: needsZh(card.summary) ? card.summary : null,
    draftOriginal: needsZh(card.draft) ? card.draft : null,
    title: titleZh,
    summary: summaryZh,
    draft: draftText,
    draftMeta,
    xIntentUrl: typeof xIntentUrl === 'function' ? xIntentUrl(draftText) : card.xIntentUrl,
    updates,
    mediaCandidates,
    translationStatus,
    translationError: anyFail
      ? titleRes.error || summaryRes.error || '译失败'
      : null,
  };
}

async function localizeCards(cards, helpers = {}) {
  const { buildDraft, xIntentUrl } = helpers;
  return mapLimited(cards || [], 4, (c) => localizeCard(c, buildDraft, xIntentUrl));
}

module.exports = {
  needsZh,
  translateToZh,
  localizeCard,
  localizeCards,
  PHRASE_MAP,
};
