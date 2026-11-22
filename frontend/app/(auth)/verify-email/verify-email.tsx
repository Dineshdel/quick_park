'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Alert } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';
import { api, ApiError } from '@/shared/lib/api';

export function VerifyEmail() {
  const token = useSearchParams().get('token');
  const [state, setState] = useState<{ kind: 'pending' | 'ok' | 'error'; message?: string }>({ kind: 'pending' });
  const started = useRef(false); // tokens are single use: never submit twice (React strict mode)

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (!token) return setState({ kind: 'error', message: 'This link is missing its token.' });
    api<{ message: string }>('/auth/verify-email', { body: { token } })
      .then((r) => setState({ kind: 'ok', message: r.message }))
      .catch((e) => setState({ kind: 'error', message: e instanceof ApiError ? e.message : 'Verification failed' }));
  }, [token]);

  if (state.kind === 'pending') return <p className="text-sm text-muted-foreground">Verifying…</p>;
  return (
    <div className="grid gap-4">
      <Alert variant={state.kind === 'ok' ? 'success' : 'destructive'}>{state.message}</Alert>
      <Button asChild>
        <Link href="/login">{state.kind === 'ok' ? 'Sign in' : 'Back to sign in'}</Link>
      </Button>
    </div>
  );
}
