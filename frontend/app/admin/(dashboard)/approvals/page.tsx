'use client';

import type { OwnerLocationDto } from '@qp/types';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FileText } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { PageShell } from '@/shared/layout/page-shell';
import { api, errorMessage, openBlob } from '@/shared/lib/api';
import { fmtDateTime, formatRupees, planUnit } from '@/shared/lib/format';
import { Alert } from '@/shared/ui/alert';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/card';
import { PhotoGallery } from '@/shared/ui/photo-gallery';
import { ReasonButton } from '@/shared/ui/reason-button';
import { ErrorPopup, useConfirm } from '@/shared/ui/confirm-dialog';

interface PendingOwner {
  id: string;
  businessName: string;
  phone: string;
  address: string;
  panNumber: string | null;
  gstin: string | null;
  bankAccountName: string | null;
  bankAccountNumber: string | null;
  bankIfsc: string | null;
  upiId: string | null;
  kycSubmittedAt: string;
  user: { name: string; email: string };
  documents: { id: string; docType: string; fileName: string }[];
}
type Approvals = {
  owners: PendingOwner[];
  locations: (OwnerLocationDto & { businessName: string })[];
};

export default function ApprovalsPage() {
  const ask = useConfirm();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['approvals'],
    queryFn: () => api<Approvals>('/admin/approvals'),
  });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setMsg(null);
    try {
      await fn();
      setMsg({ ok: true, text: ok });
      await qc.invalidateQueries({ queryKey: ['approvals'] });
      void qc.invalidateQueries({ queryKey: ['admin-overview'] });
    } catch (e) {
      setMsg({ ok: false, text: errorMessage(e) });
    }
  };

  return (
    <PageShell
      title="Approvals"
      description="Verify owners' documents, then review their parking places before they go live."
    >
      {msg?.ok && <Alert variant="success">{msg.text}</Alert>}
      <ErrorPopup message={msg && !msg.ok ? msg.text : null} onClose={() => setMsg(null)} />
      <h2 className="text-lg font-semibold">Owner verification ({q.data?.owners.length ?? 0})</h2>
      {q.data?.owners.length === 0 && (
        <p className="text-sm text-muted-foreground">Nothing waiting.</p>
      )}
      {q.data?.owners.map((o) => (
        <Card key={o.id}>
          <CardHeader>
            <CardTitle className="text-lg">{o.businessName}</CardTitle>
            <CardDescription>
              {o.user.name} · {o.user.email} · {o.phone} · submitted {fmtDateTime(o.kycSubmittedAt)}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm">
            <div className="grid gap-1 sm:grid-cols-2">
              <p>
                <span className="text-muted-foreground">Address:</span> {o.address}
              </p>
              <p>
                <span className="text-muted-foreground">PAN:</span>{' '}
                <span className="font-mono">{o.panNumber}</span>
                {o.gstin && (
                  <>
                    {' '}
                    · <span className="text-muted-foreground">GSTIN:</span>{' '}
                    <span className="font-mono">{o.gstin}</span>
                  </>
                )}
              </p>
              <p>
                <span className="text-muted-foreground">Bank:</span> {o.bankAccountName ?? '—'}{' '}
                {o.bankAccountNumber} {o.bankIfsc}
              </p>
              <p>
                <span className="text-muted-foreground">UPI:</span> {o.upiId ?? '—'}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {o.documents.map((d) => (
                <Button
                  key={d.id}
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    openBlob(`/admin/owners/${o.id}/documents/${d.id}`).catch((e) =>
                      setMsg({ ok: false, text: errorMessage(e) }),
                    )
                  }
                >
                  <FileText /> {d.docType.replace('_', ' ')}
                </Button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                onClick={() =>
                  void ask({
                    title: `Approve ${o.businessName}?`,
                    description: 'They can then list parking places.',
                    confirmLabel: 'Approve',
                  }).then((ok) => {
                    if (ok)
                      void run(
                        () => api(`/admin/owners/${o.id}/approve`, { method: 'POST' }),
                        `${o.businessName} approved.`,
                      );
                  })
                }
              >
                Approve
              </Button>
              <ReasonButton
                label="Reject"
                placeholder="What needs fixing?"
                onConfirm={(reason) =>
                  run(
                    () => api(`/admin/owners/${o.id}/reject`, { body: { reason } }),
                    `${o.businessName} rejected.`,
                  )
                }
              />
            </div>
          </CardContent>
        </Card>
      ))}

      <h2 className="mt-4 text-lg font-semibold">
        Parking places ({q.data?.locations.length ?? 0})
      </h2>
      {q.data?.locations.length === 0 && (
        <p className="text-sm text-muted-foreground">Nothing waiting.</p>
      )}
      {q.data?.locations.map((l) => (
        <Card key={l.id}>
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center gap-2 text-lg">
              {l.name} <Badge variant="muted">{l.category.name}</Badge>
              {l.isEvent && <Badge variant="warning">Event</Badge>}
            </CardTitle>
            <CardDescription>
              {l.businessName} · {l.address}, {l.city}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm">
            {l.description && <p>{l.description}</p>}
            <PhotoGallery photos={l.photos} alt={`${l.name} photo`} size="sm" />
            <ul className="grid gap-1">
              {l.capacities.map((c) => (
                <li key={c.vehicleTypeId}>
                  <b>{c.vehicleTypeName}</b>: {c.totalSlots} slots ({c.onlineSlots} online) ·{' '}
                  {l.prices
                    .filter((p) => p.vehicleTypeId === c.vehicleTypeId && p.isActive)
                    .map((p) => `${formatRupees(p.pricePaise)}/${planUnit(p.planType)}`)
                    .join(', ') || 'no prices'}
                </li>
              ))}
            </ul>
            <a
              className="text-sm underline"
              target="_blank"
              rel="noreferrer"
              href={`https://www.openstreetmap.org/?mlat=${l.lat}&mlon=${l.lng}#map=17/${l.lat}/${l.lng}`}
            >
              Check map pin
            </a>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                onClick={() =>
                  void ask({
                    title: `Approve ${l.name}?`,
                    description: 'It goes live and customers can book it.',
                    confirmLabel: 'Approve',
                  }).then((ok) => {
                    if (ok)
                      void run(
                        () => api(`/admin/locations/${l.id}/approve`, { method: 'POST' }),
                        `${l.name} is live.`,
                      );
                  })
                }
              >
                Approve
              </Button>
              <ReasonButton
                label="Reject"
                placeholder="What needs fixing?"
                onConfirm={(reason) =>
                  run(
                    () => api(`/admin/locations/${l.id}/reject`, { body: { reason } }),
                    `${l.name} sent back to the owner.`,
                  )
                }
              />
            </div>
          </CardContent>
        </Card>
      ))}
      <p className="text-xs text-muted-foreground">
        <Link className="underline" href="/admin/places">
          All places
        </Link>
      </p>
    </PageShell>
  );
}
