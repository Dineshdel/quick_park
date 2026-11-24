'use client';

import { GoogleLogin } from '@react-oauth/google';
import { useState } from 'react';
import { api, ApiError, session, type AuthResult } from '@/shared/lib/api';
import { ErrorPopup } from '@/shared/ui/confirm-dialog';

/** "Continue with Google": GIS returns an ID token, which the API verifies server-side. */
export function GoogleButton({ onSuccess }: { onSuccess: (r: AuthResult) => void }) {
  const [error, setError] = useState<string | null>(null);
  if (!process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID) return null;
  return (
    <div className="grid gap-2">
      <div className="flex justify-center">
        <GoogleLogin
          text="continue_with"
          width="320"
          onSuccess={async ({ credential }) => {
            if (!credential) return setError('Google sign-in failed');
            try {
              const result = await api<AuthResult>('/auth/google', {
                body: { idToken: credential },
              });
              session.apply(result);
              onSuccess(result);
            } catch (e) {
              setError(e instanceof ApiError ? e.message : 'Google sign-in failed');
            }
          }}
          onError={() => setError('Google sign-in failed')}
        />
      </div>
      <ErrorPopup message={error} onClose={() => setError(null)} />
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border" /> or <span className="h-px flex-1 bg-border" />
      </div>
    </div>
  );
}
