'use client';

import { GoogleOAuthProvider } from '@react-oauth/google';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
import { refreshSession } from '@/shared/lib/api';
import { useSession } from '@/shared/lib/auth/use-session';

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

/** Restores the session from the refresh cookie on load and refreshes shortly before expiry. */
function SessionKeeper() {
  const s = useSession();
  useEffect(() => {
    void refreshSession();
  }, []);
  useEffect(() => {
    if (s.status !== 'authenticated') return;
    const timer = setTimeout(() => void refreshSession(), 13 * 60_000); // access token lives 15 min
    return () => clearTimeout(timer);
  }, [s]);
  return null;
}

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: 1 } } }),
  );
  const tree = (
    <QueryClientProvider client={queryClient}>
      <SessionKeeper />
      {children}
    </QueryClientProvider>
  );
  return GOOGLE_CLIENT_ID ? <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>{tree}</GoogleOAuthProvider> : tree;
}
