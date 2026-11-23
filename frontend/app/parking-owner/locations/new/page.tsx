'use client';

import type { OwnerLocationDto } from '@qp/types';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { PageShell } from '@/shared/layout/page-shell';
import { api } from '@/shared/lib/api';
import { Card, CardContent } from '@/shared/ui/card';
import { LocationForm } from '../../_components/location-form';
import { usePolicies } from '../../_components/use-policies';

export default function NewLocationPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const policies = usePolicies();
  return (
    <PageShell title="New parking place" description="Saved as a draft. Next you'll add slots, prices and photos.">
      <Card>
        <CardContent className="pt-6">
          {policies.isPending ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            <LocationForm
              policies={policies.data ?? []}
              submitLabel="Create draft"
              onSave={async (v) => {
                const l = await api<OwnerLocationDto>('/owner/locations', { body: v });
                await qc.invalidateQueries({ queryKey: ['owner-locations'] });
                router.push(`/parking-owner/locations/${l.id}?tab=slots`);
              }}
            />
          )}
        </CardContent>
      </Card>
    </PageShell>
  );
}
