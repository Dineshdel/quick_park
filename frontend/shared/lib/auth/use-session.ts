'use client';

import { useSyncExternalStore } from 'react';
import { session, type SessionState } from '@/shared/lib/api';

const loading: SessionState = { status: 'loading' };

export function useSession(): SessionState {
  return useSyncExternalStore(session.subscribe, session.get, () => loading);
}
