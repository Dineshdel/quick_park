'use client';

import { categoryCreateSchema } from '@qp/validation';
import type { ComponentProps } from 'react';
import { PageShell } from '@/shared/layout/page-shell';
import { SimpleMasterPage } from '../_components/simple-master-page';

export default function CategoriesPage() {
  return (
    <PageShell title="Categories" description="Kinds of parking place, used for owner listings and search filters.">
      <SimpleMasterPage
        endpoint="/admin/categories"
        noun="category"
        schema={categoryCreateSchema as unknown as ComponentProps<typeof SimpleMasterPage>['schema']}
      />
    </PageShell>
  );
}
