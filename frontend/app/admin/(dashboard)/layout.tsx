import type { ReactNode } from 'react';
import { RequireAuth } from '@/shared/auth/require-auth';

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <RequireAuth roles={['SUPER_ADMIN']}>{children}</RequireAuth>;
}
