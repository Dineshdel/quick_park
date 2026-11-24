'use client';

import type { BookingDto } from '@qp/types';
import { formatPlate } from '@qp/validation';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { api } from '@/shared/lib/api';
import { fmtDateTime, formatRupees, planLabel, STATUS_LABEL } from '@/shared/lib/format';
import { PageShell } from '@/shared/layout/page-shell';
import { Alert } from '@/shared/ui/alert';
import { StatusPill } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Card, CardContent } from '@/shared/ui/card';
import { StickyBar, Tabs } from '@/shared/ui/tabs';

type Tab = 'upcoming' | 'active' | 'past';

export default function BookingsPage() {
  const [tab, setTab] = useState<Tab>('upcoming');
  const list = useQuery({
    queryKey: ['bookings', tab],
    queryFn: () => api<BookingDto[]>(`/bookings?tab=${tab}`),
  });
  return (
    <PageShell title="My bookings" description="Your passes, receipts and booking history.">
      <StickyBar className="flex flex-wrap items-center justify-between gap-3">
        <Tabs
          value={tab}
          onChange={setTab}
          items={[
            { value: 'upcoming', label: 'Upcoming' },
            { value: 'active', label: 'Parked now' },
            { value: 'past', label: 'Past' },
          ]}
        />
        <Button asChild variant="outline" size="sm">
          <Link href="/search">Find parking</Link>
        </Button>
      </StickyBar>
      {list.isPending ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : list.isError ? (
        <Alert variant="destructive">Could not load bookings.</Alert>
      ) : list.data.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No bookings here.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {list.data.map((b) => (
            <Link
              key={b.id}
              href={`/vehicle-owner/bookings/${b.id}`}
              className="rounded-lg outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              <Card className="transition-colors hover:bg-accent/40">
                <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
                  <div className="grid gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{b.location.name}</span>
                      <StatusPill status={b.status} label={STATUS_LABEL[b.status]} />
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {fmtDateTime(b.startAt)} → {fmtDateTime(b.endAt)} ·{' '}
                      {planLabel(b.planType, b.quantity)}
                    </p>
                    <p className="text-sm">
                      <span className="font-mono">{formatPlate(b.vehicle.plateNumber)}</span> ·{' '}
                      {b.vehicleType.name} ·{' '}
                      <span className="font-mono text-muted-foreground">{b.code}</span>
                    </p>
                  </div>
                  <span className="text-lg font-semibold tabular-nums">
                    {b.amountPaise === 0 ? (
                      <span className="text-success">Free</span>
                    ) : (
                      formatRupees(b.amountPaise)
                    )}
                  </span>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </PageShell>
  );
}
