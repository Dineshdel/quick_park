'use client';

import { PageShell } from '@/shared/layout/page-shell';
import { useSession } from '@/shared/lib/auth/use-session';

export default function VehicleOwnerHome() {
  const s = useSession();
  const name = s.status === 'authenticated' ? s.user.name : '';
  return <PageShell title={`Hi ${name}`} description="Your vehicles and bookings will appear here." />;
}
