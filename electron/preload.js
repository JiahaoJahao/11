'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('tufa', {
  scanNow: () => ipcRenderer.invoke('scan-now'),
  getRuntime: () => ipcRenderer.invoke('get-runtime'),
  setRuntime: (patch) => ipcRenderer.invoke('set-runtime', patch),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  appPaths: () => ipcRenderer.invoke('app-paths'),
  onScanResult: (cb) => {
    const handler = (_e, data) => cb(data);
    ipcRenderer.on('scan-result', handler);
    return () => ipcRenderer.removeListener('scan-result', handler);
  },
  onScanError: (cb) => {
    const handler = (_e, data) => cb(data);
    ipcRenderer.on('scan-error', handler);
    return () => ipcRenderer.removeListener('scan-error', handler);
  },
});
