import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
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
  },
});
