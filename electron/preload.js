'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('nexusDesktop', {
  isDesktop: true,
  expand: (height) => ipcRenderer.send('nexus:expand', { height }),
  collapse: () => ipcRenderer.send('nexus:collapse'),
  resize: (width, height) => ipcRenderer.send('nexus:resize', { width, height }),
  close: () => ipcRenderer.send('nexus:close'),
  notifyWakeWordTriggered: () => ipcRenderer.send('nexus:wakeword-triggered'),
  onGlobalVoiceTrigger: (callback) => {
    ipcRenderer.on('nexus:global-voice-trigger', (_e, data) => callback(data));
  },
});
