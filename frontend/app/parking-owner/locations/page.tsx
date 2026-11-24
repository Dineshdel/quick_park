'use client';

import { Plus } from 'lucide-react';
import Link from 'next/link';
import { PageShell } from '@/shared/layout/page-shell';
import { Alert } from '@/shared/ui/alert';
import { StatusPill } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Card, CardContent } from '@/shared/ui/card';
import { useOwnerLocations, useOwnerProfile } from '../_components/use-owner';

export default function LocationsPage() {
  const profile = useOwnerProfile();
  const list = useOwnerLocations();
  return (
    <PageShell
      title="My parking places"
      description="Create a place, set slots and prices, then submit it for approval."
    >
      {profile.data === null && (
        <Alert>
          Start with your{' '}
          <Link className="underline" href="/parking-owner/onboarding">
            business profile
          </Link>
          , then add places.
        </Alert>
      )}
      <div>
        <Button asChild disabled={!profile.data}>
          <Link href="/parking-owner/locations/new">
            <Plus /> New place
          </Link>
        </Button>
      </div>
      {list.isPending ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : !list.data?.length ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No places yet.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {list.data.map((l) => (
            <Link
              key={l.id}
              href={`/parking-owner/locations/${l.id}`}
              className="rounded-lg outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              <Card className="h-full transition-colors hover:bg-accent/40">
                <CardContent className="grid gap-2 py-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{l.name}</span>
                    <StatusPill status={l.status} />
                    {l.isEvent && <StatusPill status="PENDING" label="Event" />}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {l.address}, {l.city}
                  </p>
                  <p className="text-sm">
                    {l.capacities.reduce((s, c) => s + c.totalSlots, 0)} slots ·{' '}
                    {l.prices.filter((p) => p.isActive).length} prices · {l.photos.length} photos
                  </p>
                  {l.rejectionReason && (
                    <p className="text-sm text-destructive">Admin note: {l.rejectionReason}</p>
                  )}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </PageShell>
  );
}
