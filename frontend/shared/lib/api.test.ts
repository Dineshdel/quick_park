import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError, refreshSession, session, type AuthResult } from './api';

const user = { id: 'u1', name: 'A', email: 'a@x.com', role: 'VEHICLE_OWNER' } as AuthResult['user'];
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('api client', () => {
  const fetchMock = vi.fn<typeof fetch>();
  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    session.set({ status: 'anonymous' });
  });
  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });

  it('runs concurrent refreshes as one request', async () => {
    fetchMock.mockResolvedValue(json(200, { accessToken: 'new', expiresIn: 900, user }));
    const [a, b] = await Promise.all([refreshSession(), refreshSession()]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(a?.accessToken).toBe('new');
    expect(b).toBe(a);
    expect(session.get()).toMatchObject({ status: 'authenticated', accessToken: 'new' });
    const [, init] = fetchMock.mock.calls[0]!;
    expect((init?.headers as Record<string, string>)['x-qp-csrf']).toBe('1');
  });

  it('marks the session anonymous when refresh fails', async () => {
    session.apply({ accessToken: 'old', user });
    fetchMock.mockResolvedValue(json(401, { error: { code: 'INVALID_TOKEN', message: 'x' } }));
    expect(await refreshSession()).toBeNull();
    expect(session.get().status).toBe('anonymous');
  });

  it('on 401 refreshes once and retries with the new token', async () => {
    session.apply({ accessToken: 'expired', user });
    fetchMock
      .mockResolvedValueOnce(json(401, { error: { code: 'UNAUTHENTICATED', message: 'x' } }))
      .mockResolvedValueOnce(json(200, { accessToken: 'fresh', expiresIn: 900, user }))
      .mockResolvedValueOnce(json(200, { ok: true }));
    await expect(api('/me')).resolves.toEqual({ ok: true });
    const auth = (i: number) =>
      (fetchMock.mock.calls[i]![1]?.headers as Record<string, string>).Authorization;
    expect(auth(0)).toBe('Bearer expired');
    expect(auth(2)).toBe('Bearer fresh');
  });

  it('throws ApiError with code and field details', async () => {
    fetchMock.mockResolvedValue(
      json(400, {
        error: {
          code: 'VALIDATION_FAILED',
          message: 'Validation failed',
          details: [{ path: 'email', message: 'bad' }],
        },
      }),
    );
    const err = await api('/auth/register', { body: {} }).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({
      status: 400,
      code: 'VALIDATION_FAILED',
      details: [{ path: 'email', message: 'bad' }],
    });
  });
});
