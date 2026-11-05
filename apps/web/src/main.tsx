import '@fontsource/be-vietnam-pro/400.css';
import '@fontsource/be-vietnam-pro/500.css';
import '@fontsource/be-vietnam-pro/600.css';
import '@fontsource/be-vietnam-pro/700.css';
import '@fontsource/be-vietnam-pro/800.css';
import '@fontsource/playfair-display/400.css';
import '@fontsource/playfair-display/700.css';
import '@fontsource/playfair-display/900.css';
import './index.css';
import './premium.css';
import hallUrl from './assets/v71/hall.svg?url';

// V7.1 lobby hall artwork, shared by the lobby, the app shell and the game screens (premium.css).
document.documentElement.style.setProperty('--v71-hall', `url("${hallUrl}")`);
import './i18n';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { resolvePwaBlock } from './lib/pwaBlock';
import { installViewport } from './lib/viewport';
import { PwaBlockedScreen } from './ui/PwaBlockedScreen';

/** Canvas textures bake text in, so the fonts must be ready before any scene draws. */
async function loadFonts() {
  const faces = ['400 16px "Be Vietnam Pro"', '600 16px "Be Vietnam Pro"', '800 16px "Be Vietnam Pro"', '700 16px "Playfair Display"', '900 16px "Playfair Display"'];
  try {
    await Promise.race([Promise.all(faces.map((f) => document.fonts.load(f, 'AaĐđ7'))), new Promise((r) => setTimeout(r, 3000))]);
  } catch {
    /* fall back to system fonts */
  }
}

// The single keyboard / visible-viewport controller (see lib/viewport.ts).
const uninstallViewport = installViewport();
import.meta.hot?.dispose(uninstallViewport);

// The installed home-screen app may be blocked (lib/pwaBlock.ts): decided once, before the game
// mounts. Browsers and PCs resolve immediately; a failed check never blocks by itself.
void Promise.all([loadFonts(), resolvePwaBlock().catch(() => null)]).then(([, blocked]) => {
  createRoot(document.getElementById('root')!).render(<StrictMode>{blocked ? <PwaBlockedScreen policy={blocked} /> : <App />}</StrictMode>);
});
