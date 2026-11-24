'use client';

import type { Paginated } from '@qp/types';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { PageShell } from '@/shared/layout/page-shell';
import { api } from '@/shared/lib/api';
import { fmtDateTime } from '@/shared/lib/format';
import { Button } from '@/shared/ui/button';
import { DataTable } from '@/shared/ui/table';

interface Log {
  id: string;
  actorName: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  meta: unknown;
  createdAt: string;
}

export default function AuditPage() {
  const [page, setPage] = useState(1);
  const list = useQuery({
    queryKey: ['audit', page],
    queryFn: () => api<Paginated<Log>>(`/admin/audit-logs?page=${page}&pageSize=50`),
  });
  const pages = list.data ? Math.max(1, Math.ceil(list.data.total / list.data.pageSize)) : 1;
  return (
    <PageShell
      title="Audit log"
      description="Approvals, suspensions, refunds and payouts: who did what, and when."
    >
      <DataTable
        rows={list.data?.items ?? []}
        rowKey={(l) => l.id}
        columns={[
          {
            header: 'When',
            cell: (l) => (
              <span className="whitespace-nowrap text-xs">{fmtDateTime(l.createdAt)}</span>
            ),
          },
          { header: 'Who', cell: (l) => l.actorName ?? '—' },
          { header: 'Action', cell: (l) => <span className="font-mono text-xs">{l.action}</span> },
          {
            header: 'On',
            cell: (l) => (
              <span className="text-xs">
                {l.entity}{' '}
                <span className="font-mono text-muted-foreground">{l.entityId?.slice(0, 8)}</span>
              </span>
            ),
          },
          {
            header: 'Details',
            cell: (l) =>
              l.meta ? <code className="text-xs break-all">{JSON.stringify(l.meta)}</code> : '—',
          },
        ]}
      />
      <div className="flex items-center gap-2 text-sm">
        <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>
          Previous
        </Button>
        <span>
          Page {page} of {pages}
        </span>
        <Button
          size="sm"
          variant="outline"
          disabled={page >= pages}
          onClick={() => setPage(page + 1)}
        >
          Next
        </Button>
      </div>
    </PageShell>
  );
}
