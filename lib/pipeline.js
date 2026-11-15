'use strict';

const fs = require('fs');
const path = require('path');
const { collectAll } = require('./collectors');
const { filterItems } = require('./filter');
const { applyCelebrityGate } = require('./celebrity');
const { mergeEvents } = require('./merge');

const ROOT = path.join(__dirname, '..');

function loadJson(rel) {
  const full = path.join(ROOT, rel);
  return JSON.parse(fs.readFileSync(full, 'utf8'));
}

function loadConfig() {
  const sourcesCfg = loadJson('config/sources.json');
  const keywords = loadJson('config/keywords.json');
  const settings = loadJson('config/settings.json');
  return { sourcesCfg, keywords, settings };
}

function isRateLimited(errors) {
  return errors.some((e) => e.status === 429 || /rate.?limit|too many|429/i.test(e.message || ''));
}

/**
 * One scan cycle.
 * @param {object} opts
 * @param {object} opts.runtime — mutable UI runtime: layer enables, mute, etc.
 */
async function runPipeline(opts = {}) {
  const { sourcesCfg, keywords, settings } = loadConfig();
  const runtime = opts.runtime || {};

  const layerState = Object.fromEntries(
    Object.entries(sourcesCfg.layers || {}).map(([k, v]) => [
      k,
      { ...v, ...((runtime.layers && runtime.layers[k]) || {}) },
    ])
  );

  const mute = {
    L5: !!(runtime.mute && runtime.mute.L5),
    DIRTY: !!(runtime.mute && runtime.mute.DIRTY),
    ...(settings.mute || {}),
    ...(runtime.mute || {}),
  };

  const enabledSources = (sourcesCfg.sources || []).filter((s) => {
    if (!s.enabled) return false;
    const layer = layerState[s.layer];
    if (layer && layer.enabled === false) return false;
    if (s.layer === 'L5' && mute.L5) return false;
    if ((s.layer === 'DIRTY' || s.dirty) && mute.DIRTY) return false;
    return true;
  });

  const results = await collectAll(enabledSources, 4);

  const errors = results.filter((r) => r.error).map((r) => ({ sourceId: r.sourceId, ...r.error }));
  const degraded = isRateLimited(errors);

  let raw = results.flatMap((r) => r.items);

  // layer mute already filtered sources; double-check dirty tag path
  raw = raw.filter((item) => {
    if (item.layer === 'L5' && mute.L5) return false;
    if ((item.layer === 'DIRTY' || item.dirty) && mute.DIRTY) return false;
    return true;
  });

  const maxAgeHours = sourcesCfg.maxAgeHours || 3;
  const { items: filtered, stats } = filterItems(raw, { maxAgeHours, keywords });
  const gated = applyCelebrityGate(filtered, { ...settings, ...runtime.settings }, keywords);
  const cards = mergeEvents(gated);

  return {
    scannedAt: new Date().toISOString(),
    cards,
    stats: {
      sourcesTried: enabledSources.length,
      rawCount: raw.length,
      afterFilter: filtered.length,
      afterHeat: gated.length,
      cards: cards.length,
      ...stats,
    },
    errors,
    degraded,
    intervalSec: degraded
      ? sourcesCfg.degradedIntervalSec || 180
      : runtime.scanIntervalSec || sourcesCfg.scanIntervalSec || 90,
    config: {
      layers: layerState,
      mute,
      scanIntervalSec: sourcesCfg.scanIntervalSec,
      degradedIntervalSec: sourcesCfg.degradedIntervalSec,
      maxAgeHours,
      sources: sourcesCfg.sources.map((s) => ({
        id: s.id,
        name: s.name,
        layer: s.layer,
        enabled: s.enabled,
        dirty: !!s.dirty,
        type: s.type,
        placeholder: !!s.placeholder,
        note: s.note || null,
      })),
    },
  };
}

module.exports = {
  runPipeline,
  loadConfig,
};
