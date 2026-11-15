'use strict';

const state = {
  cards: [],
  config: null,
  degraded: false,
  currentDraft: '',
  currentXUrl: '',
  /** @type {Array<{uid:string,id:string,title:string,summary:string,translationStatus?:string,layer?:string,region?:string,dirty?:boolean}>} */
  alerts: [],
  alertSeq: 0,
};

const $ = (id) => document.getElementById(id);

function regionText(region) {
  return region === 'domestic' ? '国内' : '海外';
}

function formatTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('zh-CN', { hour12: false });
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function originalBlock(label, original) {
  if (!original) return '';
  return `<details class="orig-block"><summary>${escapeHtml(label)}原文</summary><p>${escapeHtml(original)}</p></details>`;
}

function translateChip(card) {
  if (card.translationStatus === 'failed') {
    return '<span class="chip fail" title="自动翻译失败">译失败</span>';
  }
  if (card.translationStatus === 'ok') {
    return '<span class="chip zh">已译中文</span>';
  }
  return '';
}

/** Client-side mirror of demo URL rules — never open dead mock links */
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

function isDemoCard(card) {
  return !!(card && (card.demo || card.type === 'mock' || isDemoUrl(card.url)));
}

function openSourceButton(card) {
  if (isDemoCard(card)) {
    return `<button class="btn ghost demo-disabled" type="button" disabled title="演示数据，无真实原文可打开">演示数据</button>`;
  }
  return `<button class="btn ghost" type="button" data-open="${escapeHtml(card.url || '')}">打开原文</button>`;
}

function renderLayers(config) {
  const box = $('layerToggles');
  if (!config || !config.layers) return;
  box.innerHTML = '';
  Object.entries(config.layers).forEach(([key, meta]) => {
    const label = document.createElement('label');
    label.className = 'toggle';
    const checked = meta.enabled !== false;
    label.innerHTML = `<input type="checkbox" data-layer="${escapeHtml(key)}" ${checked ? 'checked' : ''}/> ${escapeHtml(meta.label || key)}`;
    box.appendChild(label);
  });

  box.querySelectorAll('input[data-layer]').forEach((input) => {
    input.addEventListener('change', async () => {
      const layer = input.getAttribute('data-layer');
      await window.tufa.setRuntime({
        layers: { [layer]: { enabled: input.checked } },
      });
      await window.tufa.scanNow();
    });
  });
}

function renderCards(cards) {
  const feed = $('feed');
  if (!cards.length) {
    feed.innerHTML = '<div class="empty" id="emptyState">当前无 3 小时内命中线索（可放宽词表或等待下一轮扫描）</div>';
    return;
  }

  feed.innerHTML = cards
    .map((card, idx) => {
      const dirtyChip = card.dirty ? '<span class="chip dirty">脏源</span>' : '';
      const demoChip = isDemoCard(card) ? '<span class="chip demo" title="Mock/演示源">演示</span>' : '';
      const heatChip =
        card.celebrityHeat && card.celebrityHeat.pass
          ? `<span class="chip heat">热度 ${card.celebrityHeat.score}</span>`
          : '';
      const media = (card.mediaCandidates || [])
        .map((m) => {
          const soft = m.softSimilar ? '<span class="soft-flag">软相似</span>' : '';
          const demoMedia = !!(m.demo || isDemoUrl(m.url) || isDemoCard(card));
          if (demoMedia) {
            return `<span class="media-demo" title="演示数据，禁止打开死链">${escapeHtml(m.title || m.url)} <em>演示</em></span>${soft}`;
          }
          return `<a href="${escapeHtml(m.url)}" data-ext="${escapeHtml(m.url)}">${escapeHtml(m.title || m.url)}</a>${soft}`;
        })
        .join('');
      const updates =
        card.updates && card.updates.length
          ? `<ol class="updates">${card.updates
              .map(
                (u) =>
                  `<li><strong>${escapeHtml(formatTime(u.publishedAt))}</strong> ${escapeHtml(u.title)} <em>(${escapeHtml(u.sourceName || u.layer)})</em></li>`
              )
              .join('')}</ol>`
          : '';

      return `
      <article class="card" style="animation-delay:${Math.min(idx * 40, 400)}ms">
        <div class="card-head">
          <span class="chip layer">${escapeHtml(card.layer)}</span>
          <span class="chip region-${escapeHtml(card.region)}">${regionText(card.region)}</span>
          ${dirtyChip}
          ${demoChip}
          ${heatChip}
          ${translateChip(card)}
        </div>
        <h3>${escapeHtml(card.title)}</h3>
        ${originalBlock('标题', card.titleOriginal)}
        <p class="summary">${escapeHtml(card.summary)}</p>
        ${originalBlock('摘要', card.summaryOriginal)}
        <div class="meta-row">
          <span>${escapeHtml(formatTime(card.publishedAt))}</span>
          <span>${escapeHtml(card.sourceName || '')}</span>
        </div>
        <div class="source-chain">来源链：${escapeHtml(card.sourceChain || card.sourceName || '')}</div>
        <div class="media-list"><strong style="color:var(--muted);font-size:0.75rem;">媒体候选（硬去重）</strong>${media || '<span style="color:var(--muted);font-size:0.82rem;">无</span>'}</div>
        ${updates}
        <pre class="draft-preview">${escapeHtml(card.draft)}</pre>
        ${originalBlock('草稿', card.draftOriginal)}
        <div class="card-actions">
          <button class="btn" data-copy="${idx}">复制草稿</button>
          <button class="btn primary" data-edit="${idx}">编辑 / 发 X</button>
          ${openSourceButton(card)}
        </div>
      </article>`;
    })
    .join('');

  feed.querySelectorAll('[data-ext]').forEach((a) => {
    a.addEventListener('click', async (e) => {
      e.preventDefault();
      const url = a.getAttribute('data-ext');
      if (!url || isDemoUrl(url)) return;
      const res = await window.tufa.openExternal(url);
      if (res && res.blocked) {
        a.replaceWith(
          Object.assign(document.createElement('span'), {
            className: 'media-demo',
            title: '演示数据，禁止打开死链',
            innerHTML: `${escapeHtml(a.textContent)} <em>演示</em>`,
          })
        );
      }
    });
  });
  feed.querySelectorAll('[data-copy]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const i = Number(btn.getAttribute('data-copy'));
      const text = state.cards[i].draft;
      await navigator.clipboard.writeText(text);
      btn.textContent = '已复制';
      setTimeout(() => { btn.textContent = '复制草稿'; }, 1200);
    });
  });
  feed.querySelectorAll('[data-edit]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const i = Number(btn.getAttribute('data-edit'));
      openDraft(state.cards[i]);
    });
  });
  feed.querySelectorAll('[data-open]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const url = btn.getAttribute('data-open');
      if (!url || isDemoUrl(url)) {
        btn.textContent = '演示数据';
        btn.disabled = true;
        return;
      }
      const res = await window.tufa.openExternal(url);
      if (res && res.blocked) {
        btn.textContent = res.reason || '演示数据';
        btn.disabled = true;
      }
    });
  });
}

function openDraft(card) {
  state.currentDraft = card.draft;
  state.currentXUrl = card.xIntentUrl;
  $('draftText').value = card.draft;
  $('draftDialog').showModal();
}

function renderAlerts() {
  const stack = $('alertStack');
  if (!stack) return;
  if (!state.alerts.length) {
    stack.innerHTML = '';
    stack.classList.remove('has-alerts');
    return;
  }
  stack.classList.add('has-alerts');
  stack.innerHTML = state.alerts
    .map((a) => {
      const fail =
        a.translationStatus === 'failed'
          ? '<span class="chip fail">译失败</span>'
          : '';
      return `
      <div class="in-app-alert" role="alertdialog" aria-labelledby="alert-title-${escapeHtml(a.uid)}" data-uid="${escapeHtml(a.uid)}">
        <div class="in-app-alert-head">
          <strong>新线索</strong>
          ${fail}
          <span class="chip layer">${escapeHtml(a.layer || '')}</span>
        </div>
        <p class="in-app-alert-title" id="alert-title-${escapeHtml(a.uid)}">${escapeHtml(a.title)}</p>
        <p class="in-app-alert-summary">${escapeHtml((a.summary || '').slice(0, 140))}</p>
        <button type="button" class="btn primary" data-dismiss="${escapeHtml(a.uid)}">我知道了</button>
      </div>`;
    })
    .join('');

  stack.querySelectorAll('[data-dismiss]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const uid = btn.getAttribute('data-dismiss');
      state.alerts = state.alerts.filter((x) => x.uid !== uid);
      renderAlerts();
    });
  });
}

function pushAlerts(alerts) {
  for (const a of alerts || []) {
    state.alertSeq += 1;
    state.alerts.push({
      ...a,
      uid: `${a.id || 'a'}-${state.alertSeq}`,
    });
  }
  renderAlerts();
}

function applyResult(result) {
  state.cards = result.cards || [];
  state.config = result.config;
  state.degraded = !!result.degraded;

  $('degradeBanner').classList.toggle('hidden', !state.degraded);
  $('statTime').textContent = formatTime(result.scannedAt);
  $('statCards').textContent = String(result.stats?.cards ?? state.cards.length);
  $('statRaw').textContent = String(result.stats?.rawCount ?? 0);
  $('statErr').textContent = String((result.errors || []).length);
  if (result.intervalSec) $('scanInterval').value = String(result.intervalSec);

  if (result.config) {
    renderLayers(result.config);
    $('muteL5').checked = !!(result.config.mute && result.config.mute.L5);
    $('muteDirty').checked = !!(result.config.mute && result.config.mute.DIRTY);
  }

  renderCards(state.cards);
}

async function init() {
  $('btnScan').addEventListener('click', async () => {
    $('btnScan').disabled = true;
    $('btnScan').textContent = '扫描中…';
    try {
      const result = await window.tufa.scanNow();
      applyResult(result);
    } catch (err) {
      $('emptyState') && ($('emptyState').textContent = `扫描失败：${err.message || err}`);
    } finally {
      $('btnScan').disabled = false;
      $('btnScan').textContent = '立即扫描';
    }
  });

  $('scanInterval').addEventListener('change', async () => {
    const sec = Number($('scanInterval').value) || 90;
    await window.tufa.setRuntime({ scanIntervalSec: sec });
  });

  $('muteL5').addEventListener('change', async () => {
    await window.tufa.setRuntime({ mute: { L5: $('muteL5').checked } });
    await window.tufa.scanNow();
  });
  $('muteDirty').addEventListener('change', async () => {
    await window.tufa.setRuntime({ mute: { DIRTY: $('muteDirty').checked } });
    await window.tufa.scanNow();
  });

  $('btnCopyDraft').addEventListener('click', async () => {
    const text = $('draftText').value;
    await navigator.clipboard.writeText(text);
    $('btnCopyDraft').textContent = '已复制';
    setTimeout(() => { $('btnCopyDraft').textContent = '复制'; }, 1200);
  });

  $('btnOpenX').addEventListener('click', async () => {
    const text = $('draftText').value;
    const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
    await window.tufa.openExternal(url);
  });

  window.tufa.onScanResult((result) => applyResult(result));
  window.tufa.onScanError((err) => {
    const empty = $('emptyState');
    if (empty) empty.textContent = `扫描错误：${err.message || err}`;
  });
  window.tufa.onInAppAlerts((payload) => {
    pushAlerts(payload && payload.alerts);
  });
  window.tufa.onAppVisibility((vis) => {
    if (vis && vis.canShowAlerts) {
      window.tufa.flushAlerts();
    }
  });

  // Page-level fullscreen (rare) — also avoid interrupting
  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement) {
      window.tufa.flushAlerts();
    }
  });
  window.addEventListener('focus', () => {
    window.tufa.flushAlerts();
  });
}

document.addEventListener('DOMContentLoaded', init);
