import type { ApiErrorBody, ErrorCode, Role, UserStatus } from '@qp/types';

export const API_BASE = '/api/v1';
const CSRF_HEADERS = { 'x-qp-csrf': '1' };

export interface PublicUser {
  id: string;
  name: string;
  email: string;
  role: Role | null;
  status: UserStatus;
  avatarUrl: string | null;
  phone: string | null;
  emailVerified: boolean;
  hasPassword: boolean;
  createdAt: string;
}

export interface AuthResult {
  accessToken: string;
  expiresIn: number;
  user: PublicUser;
  needsRole?: boolean;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
    readonly details?: { path: string; message: string }[],
  ) {
    super(message);
  }
}

// ---------- session store (access token lives only in memory) ----------

export type SessionState =
  | { status: 'loading' }
  | { status: 'anonymous' }
  | { status: 'authenticated'; accessToken: string; user: PublicUser };

let state: SessionState = { status: 'loading' };
const listeners = new Set<() => void>();

export const session = {
  get: () => state,
  subscribe(fn: () => void) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  set(next: SessionState) {
    state = next;
    listeners.forEach((l) => l());
  },
  /** Apply an auth response (login, refresh, choose-role). */
  apply(result: Pick<AuthResult, 'accessToken' | 'user'>) {
    session.set({ status: 'authenticated', accessToken: result.accessToken, user: result.user });
  },
  setUser(user: PublicUser) {
    if (state.status === 'authenticated') session.set({ ...state, user });
  },
};

// ---------- refresh (single-flight within a tab, serialised across tabs) ----------

let refreshing: Promise<AuthResult | null> | null = null;

async function doRefresh(): Promise<AuthResult | null> {
  const res = await fetch(`${API_BASE}/auth/refresh`, {
    method: 'POST',
    headers: CSRF_HEADERS,
    credentials: 'same-origin',
  });
  return res.ok ? ((await res.json()) as AuthResult) : null;
}

/**
 * Rotates the refresh cookie and returns a new access token. Tabs share the cookie, so a Web Lock
 * makes them take turns; otherwise two tabs would present the same token and trip reuse detection.
 */
export function refreshSession(): Promise<AuthResult | null> {
  if (refreshing) return refreshing;
  const run: Promise<AuthResult | null> =
    typeof navigator !== 'undefined' && navigator.locks
      ? // lib.dom types the result as Promise<Promise<T>>; at runtime the lock resolves with T.
        (navigator.locks.request(
          'qp-auth-refresh',
          doRefresh,
        ) as unknown as Promise<AuthResult | null>)
      : doRefresh();
  refreshing = run
    .catch(() => null)
    .then((result) => {
      if (result) session.apply(result);
      else session.set({ status: 'anonymous' });
      return result;
    })
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

// ---------- fetch wrapper ----------

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  headers?: Record<string, string>;
}

async function toApiError(res: Response): Promise<ApiError> {
  const body = (await res.json().catch(() => null)) as ApiErrorBody | null;
  return new ApiError(
    res.status,
    body?.error.code ?? 'INTERNAL',
    body?.error.message ?? 'Something went wrong',
    body?.error.details as ApiError['details'],
  );
}

/** Calls the API with the in-memory bearer token; on 401 it refreshes once and retries. */
export async function api<T>(path: string, opts: RequestOptions = {}, retry = true): Promise<T> {
  const current = session.get();
  const headers: Record<string, string> = { ...opts.headers };
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (current.status === 'authenticated') headers.Authorization = `Bearer ${current.accessToken}`;
  if (path.startsWith('/auth/')) Object.assign(headers, CSRF_HEADERS);

  const res = await fetch(`${API_BASE}${path}`, {
    method: opts.method ?? (opts.body !== undefined ? 'POST' : 'GET'),
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    credentials: 'same-origin',
  });

  if (res.status === 401 && retry && current.status === 'authenticated') {
    if (await refreshSession()) return api<T>(path, opts, false);
  }
  if (!res.ok) throw await toApiError(res);
  return (res.status === 204 ? undefined : await res.json()) as T;
}

/** Authenticated download (PDF pass, KYC documents): returns an object URL the caller should revoke. */
export async function apiBlob(path: string, retry = true): Promise<string> {
  const current = session.get();
  const headers: Record<string, string> = {};
  if (current.status === 'authenticated') headers.Authorization = `Bearer ${current.accessToken}`;
  const res = await fetch(`${API_BASE}${path}`, { headers, credentials: 'same-origin' });
  if (res.status === 401 && retry && current.status === 'authenticated' && (await refreshSession()))
    return apiBlob(path, false);
  if (!res.ok) throw await toApiError(res);
  return URL.createObjectURL(await res.blob());
}

/** Multipart upload with the bearer token. */
export async function apiUpload<T>(path: string, form: FormData, retry = true): Promise<T> {
  const current = session.get();
  const headers: Record<string, string> = {};
  if (current.status === 'authenticated') headers.Authorization = `Bearer ${current.accessToken}`;
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers,
    body: form,
    credentials: 'same-origin',
  });
  if (res.status === 401 && retry && current.status === 'authenticated' && (await refreshSession()))
    return apiUpload<T>(path, form, false);
  if (!res.ok) throw await toApiError(res);
  return (await res.json()) as T;
}

export async function openBlob(path: string, download?: string) {
  const url = await apiBlob(path);
  const a = document.createElement('a');
  a.href = url;
  if (download) a.download = download;
  else a.target = '_blank';
  a.rel = 'noopener';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export const errorMessage = (e: unknown) =>
  e instanceof ApiError ? e.message : 'Something went wrong, please try again';

export async function logout() {
  await api('/auth/logout', { method: 'POST' }).catch(() => undefined);
  session.set({ status: 'anonymous' });
}
