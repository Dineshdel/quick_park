'use client';

import type { VehicleQrDto } from '@qp/types';
import { formatPlate } from '@qp/validation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Printer, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { Alert } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';
import { api, ApiError } from '@/shared/lib/api';

export default function StickerPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const key = ['vehicles', id, 'qr'];
  const qr = useQuery({ queryKey: key, queryFn: () => api<VehicleQrDto>(`/vehicles/${id}/qr`) });
  const [rotated, setRotated] = useState(false);

  const rotate = useMutation({
    mutationFn: () => api<VehicleQrDto>(`/vehicles/${id}/qr/rotate`, { method: 'POST' }),
    onSuccess: (data) => {
      qc.setQueryData(key, data);
      setRotated(true);
    },
  });

  return (
    <div className="mx-auto grid max-w-3xl gap-6 px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/vehicle-owner/vehicles">
            <ArrowLeft /> My vehicles
          </Link>
        </Button>
        {qr.data && (
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              loading={rotate.isPending}
              onClick={() => {
                if (confirm('Make a new QR code? Any sticker you already printed will stop working.')) rotate.mutate();
              }}
            >
              <RefreshCw /> New code
            </Button>
            <Button size="sm" onClick={() => window.print()}>
              <Printer /> Print
            </Button>
          </div>
        )}
      </div>

      {rotated && (
        <Alert variant="success" className="print:hidden">
          New QR code created. Print it and replace the old sticker, which no longer works.
        </Alert>
      )}
      {rotate.isError && (
        <Alert variant="destructive" className="print:hidden">
          {rotate.error instanceof ApiError ? rotate.error.message : 'Could not create a new code'}
        </Alert>
      )}

      {qr.isPending ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : qr.isError ? (
        <Alert variant="destructive">
          {qr.error instanceof ApiError && qr.error.status === 404 ? 'Vehicle not found.' : 'Could not load the QR code.'}
        </Alert>
      ) : (
        <>
          {/* The sticker: sized for an ~8 cm square when printed. */}
          <div className="mx-auto w-full max-w-[8cm] rounded-xl border-2 border-foreground bg-white p-4 text-center text-black print:border-black">
            <p className="text-sm font-bold tracking-wide">QUICK PARK</p>
            <img
              src={`data:image/svg+xml;utf8,${encodeURIComponent(qr.data.svg)}`}
              alt={`QR code for ${formatPlate(qr.data.plateNumber)}`}
              className="mx-auto my-2 aspect-square w-full"
            />
            <p className="font-mono text-xl font-bold tracking-wider">{formatPlate(qr.data.plateNumber)}</p>
            <p className="text-xs">{qr.data.vehicleTypeName} · Scan at the gate</p>
          </div>
          <p className="text-center text-sm text-muted-foreground print:hidden">
            Print this page and stick the QR code on your windscreen. At the gate, the parking owner scans it to find your booking.
            The code contains no personal details.
          </p>
        </>
      )}
    </div>
  );
}
