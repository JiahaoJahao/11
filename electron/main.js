'use strict';

const { app, BrowserWindow, ipcMain, shell, nativeImage } = require('electron');
const path = require('path');
const { runPipeline } = require('../lib/pipeline');
const { isDemoUrl } = require('../lib/utils');

let mainWindow = null;
let scanTimer = null;
let runtime = {
  layers: {},
  mute: { L5: false, DIRTY: false },
  scanIntervalSec: 90,
  knownIds: new Set(),
};

/** Fresh leads waiting until app is focused and not fullscreen */
const alertQueue = [];

const ICON_PNG = path.join(__dirname, 'icon.png');
const ICON_SVG = path.join(__dirname, 'icon.svg');

function createWindow() {
  const icon = nativeImage.createFromPath(ICON_PNG);
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    title: '突发监听',
    backgroundColor: '#0f1419',
    icon: icon.isEmpty() ? undefined : icon,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'src', 'index.html'));
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isDemoUrl(url)) return { action: 'deny' };
    shell.openExternal(url);
    return { action: 'deny' };
  });

  const pushVisibility = () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.webContents.send('app-visibility', getVisibility());
  };

  mainWindow.on('focus', () => {
    pushVisibility();
    flushAlertQueue();
  });
  mainWindow.on('blur', pushVisibility);
  mainWindow.on('enter-full-screen', pushVisibility);
  mainWindow.on('leave-full-screen', () => {
    pushVisibility();
    flushAlertQueue();
  });
  mainWindow.on('show', () => {
    pushVisibility();
    flushAlertQueue();
  });
}

function getVisibility() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return { focused: false, fullscreen: false, canShowAlerts: false };
  }
  const focused = mainWindow.isFocused();
  const fullscreen = mainWindow.isFullScreen();
  return {
    focused,
    fullscreen,
    canShowAlerts: focused && !fullscreen,
  };
}

function enqueueAlerts(cards) {
  for (const card of cards || []) {
    alertQueue.push({
      id: card.id,
      title: card.title,
      summary: card.summary,
      translationStatus: card.translationStatus,
      layer: card.layer,
      region: card.region,
      dirty: card.dirty,
      publishedAt: card.publishedAt,
    });
  }
}

function flushAlertQueue() {
  const vis = getVisibility();
  if (!vis.canShowAlerts) return;
  if (!alertQueue.length) return;
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const batch = alertQueue.splice(0, alertQueue.length);
  mainWindow.webContents.send('in-app-alerts', { alerts: batch });
}

async function doScan(reason = 'timer') {
  try {
    const result = await runPipeline({ runtime });
    runtime.scanIntervalSec = result.intervalSec;

    const fresh = [];
    for (const card of result.cards) {
      if (!runtime.knownIds.has(card.id)) {
        runtime.knownIds.add(card.id);
        fresh.push(card);
      }
    }
    // keep set bounded
    if (runtime.knownIds.size > 2000) {
      runtime.knownIds = new Set(result.cards.map((c) => c.id));
    }

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('scan-result', {
        ...result,
        reason,
        freshCount: fresh.length,
        visibility: getVisibility(),
      });
    }

    // In-app alerts only — never OS Notification / never steal fullscreen focus
    if (fresh.length) {
      enqueueAlerts(fresh);
      flushAlertQueue();
    }

    scheduleNext(result.intervalSec);
    return result;
  } catch (err) {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('scan-error', { message: err.message || String(err) });
    }
    scheduleNext(runtime.scanIntervalSec || 90);
    throw err;
  }
}

function scheduleNext(sec) {
  if (scanTimer) clearTimeout(scanTimer);
  scanTimer = setTimeout(() => {
    doScan('timer').catch(() => {});
  }, Math.max(30, sec || 90) * 1000);
}

function setupIpc() {
  ipcMain.handle('scan-now', async () => doScan('manual'));
  ipcMain.handle('get-runtime', async () => ({
    layers: runtime.layers,
    mute: runtime.mute,
    scanIntervalSec: runtime.scanIntervalSec,
  }));
  ipcMain.handle('set-runtime', async (_e, patch) => {
    if (patch.layers) runtime.layers = { ...runtime.layers, ...patch.layers };
    if (patch.mute) runtime.mute = { ...runtime.mute, ...patch.mute };
    if (typeof patch.scanIntervalSec === 'number') {
      runtime.scanIntervalSec = patch.scanIntervalSec;
      scheduleNext(runtime.scanIntervalSec);
    }
    return {
      layers: runtime.layers,
      mute: runtime.mute,
      scanIntervalSec: runtime.scanIntervalSec,
    };
  });
  ipcMain.handle('open-external', async (_e, url) => {
    if (!url) return { ok: false, blocked: true, reason: '无链接' };
    // Allow X compose intent even when draft mentions demo sources
    const isXIntent =
      /^https?:\/\/(twitter\.com|x\.com)\/intent\/(tweet|post)/i.test(String(url));
    if (!isXIntent && isDemoUrl(url)) {
      return { ok: false, blocked: true, reason: '演示数据' };
    }
    await shell.openExternal(url);
    return { ok: true, blocked: false };
  });
  ipcMain.handle('app-paths', async () => ({
    root: path.join(__dirname, '..'),
    iconPng: ICON_PNG,
    iconSvg: ICON_SVG,
  }));
  ipcMain.handle('get-visibility', async () => getVisibility());
  ipcMain.handle('flush-alerts', async () => {
    flushAlertQueue();
    return { queued: alertQueue.length, visibility: getVisibility() };
  });
}

app.whenReady().then(() => {
  setupIpc();
  createWindow();
  doScan('startup').catch(() => {});

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (scanTimer) clearTimeout(scanTimer);
  if (process.platform !== 'darwin') app.quit();
});
