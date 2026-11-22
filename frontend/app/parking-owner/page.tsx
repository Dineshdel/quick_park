'use client';

import { PageShell } from '@/shared/layout/page-shell';
import { useSession } from '@/shared/lib/auth/use-session';

export default function ParkingOwnerHome() {
  const s = useSession();
  const name = s.status === 'authenticated' ? s.user.name : '';
  return <PageShell title={`Hi ${name}`} description="Your parking places, bookings and earnings will appear here." />;
}
