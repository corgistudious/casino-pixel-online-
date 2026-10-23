// Electron shell: serves the web build from a private app:// origin and opens it in a
// locked-down window. All game logic stays on the server, exactly like the web client.
const { app, BrowserWindow, protocol, net, shell } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const WEB_ROOT = app.isPackaged ? path.join(process.resourcesPath, 'web') : path.join(__dirname, '..', 'web', 'dist');

protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 720,
    minWidth: 960,
    minHeight: 540,
    backgroundColor: '#05040b',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.once('ready-to-show', () => win.show());
  // External links open in the user's browser, never inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('app://')) e.preventDefault();
  });
  void win.loadURL(process.env.CASINO_DEV_URL || 'app://casino/index.html');
}

app.whenReady().then(() => {
  protocol.handle('app', (request) => {
    const { pathname } = new URL(request.url);
    const target = path.normalize(path.join(WEB_ROOT, decodeURIComponent(pathname)));
    if (!target.startsWith(WEB_ROOT)) return new Response('Forbidden', { status: 403 });
    return net.fetch(pathToFileURL(target).toString());
  });
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
