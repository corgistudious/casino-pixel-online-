import { api, ApiError } from './api';

/** Step-up token from POST /api/auth/reauth; kept in memory only (never persisted). */
let reauth: { token: string; expiresAt: number } | null = null;
let askPassword: (() => Promise<string | null>) | null = null;

/** Registered by <ReauthDialog/>: shows the password prompt and resolves with the input (null = cancelled). */
export function setPasswordPrompt(fn: (() => Promise<string | null>) | null) {
  askPassword = fn;
}

export function clearReauth() {
  reauth = null;
}

function reauthHeaders(): Record<string, string> {
  return reauth && reauth.expiresAt > Date.now() + 5_000 ? { 'x-keyo-reauth': reauth.token } : {};
}

/**
 * Admin API call. When the server asks for a password re-confirmation (sensitive actions), the
 * prompt is shown once, the step-up token is fetched and the call is retried.
 */
export async function adminApi<T>(path: string, init: { method?: string; body?: unknown; raw?: Blob } = {}): Promise<T> {
  try {
    return await api<T>(path, { ...init, headers: reauthHeaders() });
  } catch (err) {
    if (!(err instanceof ApiError) || err.code !== 'reauth_required' || !askPassword) throw err;
    const password = await askPassword();
    if (!password) throw err;
    const res = await api<{ token: string; expiresAt: string }>('/api/auth/reauth', { method: 'POST', body: { password } });
    reauth = { token: res.token, expiresAt: Date.parse(res.expiresAt) };
    return api<T>(path, { ...init, headers: reauthHeaders() });
  }
}

/** Fresh idempotency key (UUID v4) for one intended admin action; reuse it only to retry that same action. */
export function newIdempotencyKey(): string {
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6]! & 0x0f) | 0x40;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
