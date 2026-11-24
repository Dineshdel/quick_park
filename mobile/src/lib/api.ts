import type { ApiErrorBody, ErrorCode, Role, UserStatus } from '@qp/types';
import * as SecureStore from 'expo-secure-store';
import { API_BASE } from './config';

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
  /** Mobile clients get the refresh token in the body (kept in the device's secure storage). */
  refreshToken?: string;
  needsRole?: boolean;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode | 'NETWORK',
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

export const errorMessage = (e: unknown) =>
  e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Something went wrong';

// ---------- session (access token in memory, refresh token in secure storage) ----------

const REFRESH_KEY = 'qp.refreshToken';
/** Tells the API this is the native app: refresh token in the body instead of a cookie. */
const MOBILE_HEADERS = { 'X-QP-Client': 'mobile', 'x-qp-csrf': '1' };

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
    return () => {
      listeners.delete(fn);
    };
  },
  set(next: SessionState) {
    state = next;
    listeners.forEach((l) => l());
  },
  /** Apply a login / refresh / register response: keep the refresh token on the device. */
  async apply(result: AuthResult) {
    if (result.refreshToken) await SecureStore.setItemAsync(REFRESH_KEY, result.refreshToken);
    session.set({ status: 'authenticated', accessToken: result.accessToken, user: result.user });
  },
  setUser(user: PublicUser) {
    if (state.status === 'authenticated') session.set({ ...state, user });
  },
  async clear() {
    await SecureStore.deleteItemAsync(REFRESH_KEY).catch(() => undefined);
    session.set({ status: 'anonymous' });
  },
};

let refreshing: Promise<AuthResult | null> | null = null;

/** Rotates the refresh token (single-flight) and returns the new session, or null when signed out. */
export function refreshSession(): Promise<AuthResult | null> {
  if (refreshing) return refreshing;
  refreshing = (async () => {
    const token = await SecureStore.getItemAsync(REFRESH_KEY);
    if (!token) return null;
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { ...MOBILE_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: token }),
    });
    if (res.status === 401 || res.status === 403) {
      await SecureStore.deleteItemAsync(REFRESH_KEY);
      return null;
    }
    if (!res.ok) throw new Error('refresh failed');
    return (await res.json()) as AuthResult;
  })()
    .then(async (r) => {
      if (r) await session.apply(r);
      else session.set({ status: 'anonymous' });
      return r;
    })
    .catch(() => {
      // Offline or server down: keep whatever we had; a later call retries.
      if (state.status === 'loading') session.set({ status: 'anonymous' });
      return null;
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
    body?.error.details,
  );
}

/** Calls the API with the bearer token; on 401 refreshes once and retries. */
export async function api<T>(path: string, opts: RequestOptions = {}, retry = true): Promise<T> {
  const current = session.get();
  const headers: Record<string, string> = { Accept: 'application/json', ...opts.headers };
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (current.status === 'authenticated') headers.Authorization = `Bearer ${current.accessToken}`;
  if (path.startsWith('/auth/')) Object.assign(headers, MOBILE_HEADERS);

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method: opts.method ?? (opts.body !== undefined ? 'POST' : 'GET'),
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'NETWORK', `Can't reach the server. Check your internet connection.`);
  }

  if (res.status === 401 && retry && current.status === 'authenticated') {
    if (await refreshSession()) return api<T>(path, opts, false);
  }
  if (!res.ok) throw await toApiError(res);
  return (res.status === 204 ? undefined : await res.json()) as T;
}

/** Sign out on this device and revoke the refresh token on the server. */
export async function signOut() {
  const token = await SecureStore.getItemAsync(REFRESH_KEY);
  if (token) {
    await fetch(`${API_BASE}/auth/logout`, {
      method: 'POST',
      headers: { ...MOBILE_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: token }),
    }).catch(() => undefined);
  }
  await session.clear();
}
