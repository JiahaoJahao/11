'use strict';

const { regionLabel } = require('./utils');

/**
 * Minimal-risk draft shell.
 * Dirty sources always force 「网传」.
 */
function buildDraft(item) {
  const dirty = !!(item.dirty || item.layer === 'DIRTY');
  const shell = dirty ? '网传' : pickShell(item);
  const region = regionLabel(item.region);
  const sourceChain = buildSourceChain(item);
  const summary = compressSummary(item.summary || item.title || '');
  const heatNote =
    item.celebrityHeat && item.celebrityHeat.name
      ? `｜热度 ${item.celebrityHeat.score}`
      : '';

  const text = [
    `【${shell}】${summary}`,
    ``,
    `范围：${region}${heatNote}`,
    `来源链：${sourceChain}`,
    dirty ? `标注：脏源（未核实，仅作线索）` : `标注：公开线索，发布前请自行核实`,
  ].join('\n');

  return {
    shell,
    text,
    forcedWangchuan: dirty,
  };
}

function pickShell(item) {
  if (item.layer === 'L5') return '网传';
  if (item.layer === 'L1' || item.layer === 'L2') {
    const name = item.sourceName || '公开源';
    return `据${shortName(name)}`;
  }
  return '网传';
}

function shortName(name) {
  return String(name).replace(/\s+/g, '').slice(0, 12);
}

function buildSourceChain(item) {
  const parts = [];
  if (item.sourceName) parts.push(item.sourceName);
  if (item.layer) parts.push(item.layer);
  if (item.url) parts.push(item.url);
  if (Array.isArray(item.sourceChainExtra)) {
    parts.push(...item.sourceChainExtra);
  }
  return parts.join(' → ');
}

function compressSummary(s) {
  const t = String(s).replace(/\s+/g, ' ').trim();
  if (t.length <= 120) return t;
  return `${t.slice(0, 117)}…`;
}

function xIntentUrl(draftText) {
  const encoded = encodeURIComponent(draftText);
  return `https://twitter.com/intent/tweet?text=${encoded}`;
}

module.exports = {
  buildDraft,
  xIntentUrl,
};
