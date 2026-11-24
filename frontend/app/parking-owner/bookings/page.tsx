'use client';

import type { BookingStatus, OwnerBookingDto } from '@qp/types';
import { formatPlate } from '@qp/validation';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { PageShell } from '@/shared/layout/page-shell';
import { api } from '@/shared/lib/api';
import { fmtDateTime, formatRupees, planLabel, STATUS_LABEL } from '@/shared/lib/format';
import { StatusPill } from '@/shared/ui/badge';
import { Input } from '@/shared/ui/input';
import { Select } from '@/shared/ui/select';
import { DataTable } from '@/shared/ui/table';
import { useOwnerLocations } from '../_components/use-owner';

export default function OwnerBookingsPage() {
  const locs = useOwnerLocations();
  const [locationId, setLocationId] = useState('');
  const [date, setDate] = useState('');
  const [status, setStatus] = useState<BookingStatus | ''>('');
  const qs = new URLSearchParams({
    ...(locationId && { locationId }),
    ...(date && { date }),
    ...(status && { status }),
  }).toString();
  const list = useQuery({
    queryKey: ['owner-bookings', qs],
    queryFn: () => api<OwnerBookingDto[]>(`/owner/bookings?${qs}`),
  });
  return (
    <PageShell
      title="Bookings"
      description="Who booked your places. Customer contact details stay private."
    >
      <div className="flex flex-wrap gap-2">
        <Select
          value={locationId}
          onChange={(e) => setLocationId(e.target.value)}
          className="w-56"
          aria-label="Place"
        >
          <option value="">All places</option>
          {locs.data?.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </Select>
        <Input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="w-44"
          aria-label="Date"
        />
        <Select
          value={status}
          onChange={(e) => setStatus(e.target.value as BookingStatus | '')}
          className="w-44"
          aria-label="Status"
        >
          <option value="">Any status</option>
          {(['CONFIRMED', 'ACTIVE', 'COMPLETED', 'CANCELLED', 'EXPIRED'] as BookingStatus[]).map(
            (s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ),
          )}
        </Select>
      </div>
      {list.isPending ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <DataTable
          rows={list.data ?? []}
          rowKey={(b) => b.id}
          empty="No bookings match."
          columns={[
            { header: 'Booking', cell: (b) => <span className="font-mono text-xs">{b.code}</span> },
            { header: 'Customer', cell: (b) => b.customerName },
            {
              header: 'Vehicle',
              cell: (b) => (
                <span>
                  <span className="font-mono">{formatPlate(b.plateNumber)}</span> ·{' '}
                  {b.vehicleTypeName}
                </span>
              ),
            },
            { header: 'Place', cell: (b) => b.location.name },
            {
              header: 'When',
              cell: (b) => (
                <span className="whitespace-nowrap">
                  {fmtDateTime(b.startAt)} → {fmtDateTime(b.endAt)}
                </span>
              ),
            },
            { header: 'Plan', cell: (b) => planLabel(b.planType, b.quantity) },
            {
              header: 'Status',
              cell: (b) => <StatusPill status={b.status} label={STATUS_LABEL[b.status]} />,
            },
            {
              header: 'Amount',
              cell: (b) => (b.amountPaise === 0 ? 'Free' : formatRupees(b.amountPaise)),
              className: 'text-right tabular-nums',
            },
          ]}
        />
      )}
    </PageShell>
  );
}
