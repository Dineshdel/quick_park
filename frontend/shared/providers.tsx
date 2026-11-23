'use client';

import { GoogleOAuthProvider } from '@react-oauth/google';
import { APIProvider } from '@vis.gl/react-google-maps';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
import { refreshSession } from '@/shared/lib/api';
import { useSession } from '@/shared/lib/auth/use-session';
import { GOOGLE_MAPS_KEY } from '@/shared/maps/config';

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
  const app = (
    <QueryClientProvider client={queryClient}>
      <SessionKeeper />
      {children}
    </QueryClientProvider>
  );
  // Google Maps + Places load once for the whole app when a key is configured.
  const tree = GOOGLE_MAPS_KEY ? (
    <APIProvider apiKey={GOOGLE_MAPS_KEY} region="IN" language="en">
      {app}
    </APIProvider>
  ) : (
    app
  );
  return GOOGLE_CLIENT_ID ? <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>{tree}</GoogleOAuthProvider> : tree;
}
