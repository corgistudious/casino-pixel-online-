const apiBase = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');

export const API_URL = apiBase;

export function wsUrl(): string {
  if (apiBase) return apiBase.replace(/^http/, 'ws') + '/ws';
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${location.host}/ws`;
}

export const APP_VERSION = __APP_VERSION__;
