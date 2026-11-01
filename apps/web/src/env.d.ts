/// <reference types="vite/client" />

declare const __APP_VERSION__: string;
/** Commit the bundle was built from (see vite.config.ts buildStamp). */
declare const __APP_COMMIT__: string;

interface ImportMetaEnv {
  /** Absolute backend URL for native builds, e.g. https://play.example.com. Empty = same origin. */
  readonly VITE_API_URL?: string;
  /** '1' = show the viewport diagnostics overlay (Test builds only, for iPhone home-screen app checks). */
  readonly VITE_VIEWPORT_DIAG?: string;
}
