import react from '@vitejs/plugin-react';
import { execSync } from 'node:child_process';
import { defineConfig, type Plugin } from 'vite';

/**
 * Build stamp: the commit this bundle was built from (KEYO_COMMIT, else `git rev-parse`, else
 * 'unknown' — Docker builds have no .git, so they pass it as a build arg). Written into index.html
 * as <meta name="keyo-build">; the shell is served no-cache, so `curl <site>/ | grep keyo-build`
 * always shows what is deployed.
 */
function buildCommit(): string {
  if (process.env.KEYO_COMMIT) return process.env.KEYO_COMMIT.slice(0, 12);
  try {
    return execSync('git rev-parse --short=12 HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return 'unknown';
  }
}
const COMMIT = buildCommit();
const buildStamp = (): Plugin => ({
  name: 'keyo-build-stamp',
  transformIndexHtml: (html) => html.replace('</head>', `    <meta name="keyo-build" content="${COMMIT} ${new Date().toISOString()}" />\n  </head>`),
});

export default defineConfig({
  plugins: [react(), buildStamp()],
  // Relative base so the same build works on the web, inside Electron (file://) and Capacitor.
  base: './',
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api': 'http://localhost:3000',
      '/ws': { target: 'ws://localhost:3000', ws: true },
    },
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      output: {
        // Only Phaser's own files: with the object form Rollup also put its CommonJS interop helper in
        // this chunk, so the entry imported (and preloaded) all of Phaser on every page.
        // Its interop helper (shared with app code) gets its own tiny chunk for the same reason.
        manualChunks: (id) => (id.includes('/node_modules/phaser/') ? 'phaser' : id.includes('commonjsHelpers') ? 'cjs' : undefined),
      },
    },
  },
  define: {
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? '0.1.0'),
    __APP_COMMIT__: JSON.stringify(COMMIT),
  },
});
