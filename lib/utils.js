'use strict';

const crypto = require('crypto');

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function sha1(text) {
  return crypto.createHash('sha1').update(String(text || '')).digest('hex');
}

function normalizeUrl(url) {
  if (!url) return '';
  try {
    const u = new URL(url.trim());
    u.hash = '';
    // strip common tracking params
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'fbclid', 'gclid'].forEach((k) => {
      u.searchParams.delete(k);
    });
    return u.toString();
  } catch {
    return String(url).trim();
  }
}

function softTitleKey(title) {
  return String(title || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}

function parseDate(value) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  const d = new Date(value);
  if (!Number.isNaN(d.getTime())) return d;
  return null;
}

function withinHours(date, hours) {
  const d = parseDate(date);
  if (!d) return false;
  const ageMs = Date.now() - d.getTime();
  return ageMs >= 0 && ageMs <= hours * 3600 * 1000;
}

function ageMinutesFromNow(minutesAgo) {
  return new Date(Date.now() - minutesAgo * 60 * 1000);
}

function regionLabel(region) {
  return region === 'domestic' ? '国内' : '海外';
}

function layerLabel(layer, layersMeta) {
  if (layersMeta && layersMeta[layer] && layersMeta[layer].label) {
    return layersMeta[layer].label;
  }
  return layer;
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

/**
 * Demo / mock / placeholder URLs that must not open as "原文"
 * (dead X pages, example.com, etc.).
 */
function isDemoUrl(url) {
  const raw = String(url || '').trim();
  if (!raw) return true;
  let host = '';
  let pathname = '';
  try {
    const u = new URL(raw);
    host = (u.hostname || '').toLowerCase();
    pathname = (u.pathname || '').toLowerCase();
  } catch {
    return /mock|example\.com|placeholder/i.test(raw);
  }
  if (
    host === 'example.com' ||
    host.endsWith('.example.com') ||
    host === 'example.org' ||
    host === 'example.net' ||
    host === 'localhost' ||
    host === '127.0.0.1'
  ) {
    return true;
  }
  if (/\/status\/mock[-_/]|\/mock[-_/]|\/placeholder/i.test(pathname)) return true;
  if (/mock[-_]|(^|\/)demo($|\/)|placeholder/i.test(pathname)) return true;
  if ((host === 'x.com' || host === 'twitter.com' || host.endsWith('.x.com')) && /\/example\b/i.test(pathname)) {
    return true;
  }
  return false;
}

function isDemoItem(item) {
  if (!item) return false;
  if (item.demo || item.placeholder) return true;
  if (item.type === 'mock') return true;
  if (isDemoUrl(item.url)) return true;
  return false;
}

module.exports = {
  sleep,
  sha1,
  normalizeUrl,
  softTitleKey,
  parseDate,
  withinHours,
  ageMinutesFromNow,
  regionLabel,
  layerLabel,
  clamp,
  isDemoUrl,
  isDemoItem,
};
