'use client';

import { formatPlate } from '@qp/validation';
import { CalendarClock, Car, Search } from 'lucide-react';
import Link from 'next/link';
import { PageShell } from '@/shared/layout/page-shell';
import { Button } from '@/shared/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/card';
import { useSession } from '@/shared/lib/auth/use-session';
import { useVehicles } from './_components/use-vehicles';

export default function VehicleOwnerHome() {
  const s = useSession();
  const name = s.status === 'authenticated' ? s.user.name.split(' ')[0] : '';
  const vehicles = useVehicles();
  const count = vehicles.data?.length ?? 0;

  return (
    <PageShell title={`Hi ${name}`} description="Find parking, book it and enter with a QR code.">
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="md:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Car className="size-5" aria-hidden /> My vehicles
            </CardTitle>
            <CardDescription>
              {vehicles.isPending
                ? 'Loading…'
                : count === 0
                  ? 'Add a vehicle to get its QR sticker.'
                  : `${count} vehicle${count === 1 ? '' : 's'}: ${vehicles.data!.slice(0, 3).map((v) => formatPlate(v.plateNumber)).join(', ')}${count > 3 ? '…' : ''}`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/vehicle-owner/vehicles">{count === 0 ? 'Add a vehicle' : 'Manage vehicles'}</Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Search className="size-5" aria-hidden /> Find parking
            </CardTitle>
            <CardDescription>Search near you or at your destination and book in a minute.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline">
              <Link href="/search">Search</Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <CalendarClock className="size-5" aria-hidden /> My bookings
            </CardTitle>
            <CardDescription>Upcoming, active and past bookings with your entry pass.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline">
              <Link href="/vehicle-owner/bookings">Open bookings</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </PageShell>
  );
}
