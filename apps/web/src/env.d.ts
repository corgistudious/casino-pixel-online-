/// <reference types="vite/client" />

declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  /** Absolute backend URL for native builds, e.g. https://play.example.com. Empty = same origin. */
  readonly VITE_API_URL?: string;
}
