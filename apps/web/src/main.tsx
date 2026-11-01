import '@fontsource/be-vietnam-pro/400.css';
import '@fontsource/be-vietnam-pro/500.css';
import '@fontsource/be-vietnam-pro/600.css';
import '@fontsource/be-vietnam-pro/700.css';
import '@fontsource/be-vietnam-pro/800.css';
import '@fontsource/playfair-display/400.css';
import '@fontsource/playfair-display/700.css';
import '@fontsource/playfair-display/900.css';
import './index.css';
import './i18n';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { installViewport } from './lib/viewport';

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

void loadFonts().then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
