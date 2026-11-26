import type { ReactNode } from 'react';
import { RoleShell } from '../_components/role-shell';

export default function AccountLayout({ children }: { children: ReactNode }) {
  return <RoleShell>{children}</RoleShell>;
}
