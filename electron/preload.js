'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('tufa', {
  scanNow: () => ipcRenderer.invoke('scan-now'),
  getRuntime: () => ipcRenderer.invoke('get-runtime'),
  setRuntime: (patch) => ipcRenderer.invoke('set-runtime', patch),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  appPaths: () => ipcRenderer.invoke('app-paths'),
  getVisibility: () => ipcRenderer.invoke('get-visibility'),
  flushAlerts: () => ipcRenderer.invoke('flush-alerts'),
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
  onInAppAlerts: (cb) => {
    const handler = (_e, data) => cb(data);
    ipcRenderer.on('in-app-alerts', handler);
    return () => ipcRenderer.removeListener('in-app-alerts', handler);
  },
  onAppVisibility: (cb) => {
    const handler = (_e, data) => cb(data);
    ipcRenderer.on('app-visibility', handler);
    return () => ipcRenderer.removeListener('app-visibility', handler);
  },
});
