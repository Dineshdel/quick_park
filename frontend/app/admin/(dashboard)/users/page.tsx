'use client';

import type { Paginated, Role, UserStatus } from '@qp/types';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { PageShell } from '@/shared/layout/page-shell';
import { api, errorMessage } from '@/shared/lib/api';
import { fmtDate } from '@/shared/lib/format';
import { Alert } from '@/shared/ui/alert';
import { StatusPill } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Select } from '@/shared/ui/select';
import { DataTable } from '@/shared/ui/table';

interface U { id: string; name: string; email: string; role: Role | null; status: UserStatus; createdAt: string; lastLoginAt: string | null }

export default function UsersPage() {
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [role, setRole] = useState('');
  const [page, setPage] = useState(1);
  const qs = new URLSearchParams({ page: String(page), ...(q && { q }), ...(role && { role }) }).toString();
  const list = useQuery({ queryKey: ['admin-users', qs], queryFn: () => api<Paginated<U>>(`/admin/users?${qs}`) });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const setStatus = async (u: U, status: UserStatus) => {
    try {
      const r = await api<{ placesSuspended?: number; cancelled?: number; refundedPaise?: number; activeLeft?: number }>(`/admin/users/${u.id}/status`, { method: 'PATCH', body: { status } });
      const places = r.placesSuspended ? ` ${r.placesSuspended} place${r.placesSuspended === 1 ? '' : 's'} suspended,` : '';
      const extra = r.placesSuspended ? `${places} ${r.cancelled} booking${r.cancelled === 1 ? '' : 's'} cancelled and refunded${r.activeLeft ? `, ${r.activeLeft} active left to settle` : ''}.` : '';
      setMsg({ ok: true, text: `${u.name} is now ${status.toLowerCase()}.${extra}` });
      await qc.invalidateQueries({ queryKey: ['admin-users'] });
    } catch (e) {
      setMsg({ ok: false, text: errorMessage(e) });
    }
  };
  const pages = list.data ? Math.max(1, Math.ceil(list.data.total / list.data.pageSize)) : 1;
  return (
    <PageShell title="Users" description="Suspending a user signs them out everywhere within seconds.">
      {msg && <Alert variant={msg.ok ? 'success' : 'destructive'}>{msg.text}</Alert>}
      <div className="flex flex-wrap gap-2">
        <Input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Name or email" className="w-64" aria-label="Search" />
        <Select value={role} onChange={(e) => { setRole(e.target.value); setPage(1); }} className="w-48" aria-label="Role">
          <option value="">All roles</option>
          <option value="VEHICLE_OWNER">Vehicle owners</option>
          <option value="PARKING_OWNER">Parking owners</option>
          <option value="SUPER_ADMIN">Admins</option>
        </Select>
      </div>
      <DataTable
        rows={list.data?.items ?? []}
        rowKey={(u) => u.id}
        columns={[
          { header: 'Name', cell: (u) => u.name },
          { header: 'Email', cell: (u) => u.email },
          { header: 'Role', cell: (u) => u.role?.replace('_', ' ').toLowerCase() ?? 'not chosen' },
          { header: 'Joined', cell: (u) => fmtDate(u.createdAt) },
          { header: 'Status', cell: (u) => <StatusPill status={u.status === 'ACTIVE' ? 'ACTIVE' : 'SUSPENDED'} /> },
          { header: '', cell: (u) => (u.status === 'ACTIVE' ? <Button size="sm" variant="outline" onClick={() => confirm(u.role === 'PARKING_OWNER' ? `Suspend ${u.name}? Their live places are suspended too and upcoming bookings are cancelled with a full refund.` : `Suspend ${u.name}?`) && setStatus(u, 'SUSPENDED')}>Suspend</Button> : <Button size="sm" variant="outline" onClick={() => setStatus(u, 'ACTIVE')}>Reactivate</Button>) },
        ]}
      />
      <div className="flex items-center gap-2 text-sm">
        <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
        <span>Page {page} of {pages}</span>
        <Button size="sm" variant="outline" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</Button>
      </div>
    </PageShell>
  );
}
