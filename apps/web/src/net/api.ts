import type { ErrorCode } from '@casino/shared';
import { API_URL } from '../config';
import { demoApi, IS_DEMO } from '../demo';

export class ApiError extends Error {
  constructor(
    public readonly code: ErrorCode | 'network',
    public readonly status = 0,
    /** Extra fields from the error body, e.g. `endsAt` and `reason` for `banned`. */
    public readonly details: { endsAt?: string | null; reason?: string } = {},
  ) {
    super(code);
  }
}

let authToken: string | null = null;
let onUnauthorized: (() => void) | null = null;

export function setAuthToken(token: string | null) {
  authToken = token;
}

export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn;
}

export async function api<T>(path: string, init: { method?: string; body?: unknown; headers?: Record<string, string>; raw?: Blob } = {}): Promise<T> {
  if (IS_DEMO) {
    try {
      return (await demoApi(path, init.method ?? 'GET', init.body)) as T;
    } catch (err) {
      throw new ApiError((err as { code: ErrorCode }).code ?? 'network');
    }
  }
  let res: Response;
  try {
    res = await fetch(API_URL + path, {
      method: init.method ?? 'GET',
      headers: {
        ...(init.raw ? { 'content-type': init.raw.type } : init.body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(authToken ? { authorization: `Bearer ${authToken}` } : {}),
        ...init.headers,
      },
      // `raw` sends a file as-is (image uploads); everything else is JSON.
      body: init.raw ?? (init.body !== undefined ? JSON.stringify(init.body) : undefined),
    });
  } catch {
    throw new ApiError('network');
  }
  const data = (await res.json().catch(() => ({}))) as { error?: { code?: ErrorCode; endsAt?: string | null; reason?: string } };
  if (!res.ok) {
    const { code = 'internal', ...details } = data.error ?? {};
    if (code === 'unauthorized' || code === 'banned') onUnauthorized?.();
    throw new ApiError(code, res.status, details);
  }
  return data as T;
}

/** Authenticated binary GET (e.g. staff-only evidence images), returned as a Blob. */
export async function apiBlob(path: string): Promise<Blob> {
  let res: Response;
  try {
    res = await fetch(API_URL + path, { headers: authToken ? { authorization: `Bearer ${authToken}` } : {} });
  } catch {
    throw new ApiError('network');
  }
  if (!res.ok) throw new ApiError(res.status === 403 ? 'forbidden' : res.status === 404 ? 'not_found' : 'internal', res.status);
  return res.blob();
}
