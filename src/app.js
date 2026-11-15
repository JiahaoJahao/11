'use strict';

const state = {
  cards: [],
  config: null,
  degraded: false,
  currentDraft: '',
  currentXUrl: '',
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
      const heatChip =
        card.celebrityHeat && card.celebrityHeat.pass
          ? `<span class="chip heat">热度 ${card.celebrityHeat.score}</span>`
          : '';
      const media = (card.mediaCandidates || [])
        .map((m) => {
          const soft = m.softSimilar ? '<span class="soft-flag">软相似</span>' : '';
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
          ${heatChip}
        </div>
        <h3>${escapeHtml(card.title)}</h3>
        <p class="summary">${escapeHtml(card.summary)}</p>
        <div class="meta-row">
          <span>${escapeHtml(formatTime(card.publishedAt))}</span>
          <span>${escapeHtml(card.sourceName || '')}</span>
        </div>
        <div class="source-chain">来源链：${escapeHtml(card.sourceChain || card.sourceName || '')}</div>
        <div class="media-list"><strong style="color:var(--muted);font-size:0.75rem;">媒体候选（硬去重）</strong>${media || '<span style="color:var(--muted);font-size:0.82rem;">无</span>'}</div>
        ${updates}
        <pre class="draft-preview">${escapeHtml(card.draft)}</pre>
        <div class="card-actions">
          <button class="btn" data-copy="${idx}">复制草稿</button>
          <button class="btn primary" data-edit="${idx}">编辑 / 发 X</button>
          <button class="btn ghost" data-open="${escapeHtml(card.url || '')}">打开原文</button>
        </div>
      </article>`;
    })
    .join('');

  feed.querySelectorAll('[data-ext]').forEach((a) => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      window.tufa.openExternal(a.getAttribute('data-ext'));
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
    btn.addEventListener('click', () => {
      const url = btn.getAttribute('data-open');
      if (url) window.tufa.openExternal(url);
    });
  });
}

function openDraft(card) {
  state.currentDraft = card.draft;
  state.currentXUrl = card.xIntentUrl;
  $('draftText').value = card.draft;
  $('draftDialog').showModal();
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
}

document.addEventListener('DOMContentLoaded', init);
