'use client';

import { vehicleTypeCreateSchema } from '@qp/validation';
import type { ComponentProps } from 'react';
import { PageShell } from '@/shared/layout/page-shell';
import { SimpleMasterPage } from '../_components/simple-master-page';

export default function VehicleTypesPage() {
  return (
    <PageShell
      title="Vehicle types"
      description="Types customers pick for their vehicles and owners price separately. Deactivate a type to hide it without losing history."
    >
      <SimpleMasterPage
        endpoint="/admin/vehicle-types"
        noun="vehicle type"
        schema={vehicleTypeCreateSchema as unknown as ComponentProps<typeof SimpleMasterPage>['schema']}
        withCode
      />
    </PageShell>
  );
}
