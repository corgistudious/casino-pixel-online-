// Intentionally minimal: the renderer gets no Node.js access.
const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('casinoDesktop', { platform: process.platform });
