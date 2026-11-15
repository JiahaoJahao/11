'use strict';

const { app, BrowserWindow, ipcMain, shell, Notification, nativeImage } = require('electron');
const path = require('path');
const { runPipeline } = require('../lib/pipeline');

let mainWindow = null;
let scanTimer = null;
let runtime = {
  layers: {},
  mute: { L5: false, DIRTY: false },
  scanIntervalSec: 90,
  knownIds: new Set(),
};

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
    shell.openExternal(url);
    return { action: 'deny' };
  });
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
      });
    }

    if (fresh.length && Notification.isSupported()) {
      const top = fresh[0];
      new Notification({
        title: '突发监听 · 新线索',
        body: top.title.slice(0, 80),
        icon: ICON_PNG,
      }).show();
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
    if (url) await shell.openExternal(url);
    return true;
  });
  ipcMain.handle('app-paths', async () => ({
    root: path.join(__dirname, '..'),
    iconPng: ICON_PNG,
    iconSvg: ICON_SVG,
  }));
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
