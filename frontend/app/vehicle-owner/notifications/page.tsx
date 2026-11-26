'use client';

import type { NotificationDto } from '@qp/types';
import { useQueryClient } from '@tanstack/react-query';
import { Bell, CheckCheck } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { PageShell } from '@/shared/layout/page-shell';
import { useNotifications } from '@/shared/layout/notification-bell';
import { api, errorMessage } from '@/shared/lib/api';
import { fmtDateTime, formatRupees } from '@/shared/lib/format';
import { Alert } from '@/shared/ui/alert';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Card, CardContent } from '@/shared/ui/card';
import { Tabs } from '@/shared/ui/tabs';

type Filter = 'all' | 'unread';

/** All of the driver's notifications (the sidebar "Notifications" menu). */
export default function NotificationsPage() {
  const qc = useQueryClient();
  const q = useNotifications();
  const [filter, setFilter] = useState<Filter>('all');
  const refresh = () => qc.invalidateQueries({ queryKey: ['notifications'] });
  const markRead = (n: NotificationDto) => {
    if (!n.read)
      void api(`/notifications/${n.id}/read`, { body: {} }).then(refresh, () => undefined);
  };
  const markAll = async () => {
    await api('/notifications/read-all', { body: {} }).catch(() => undefined);
    await refresh();
  };

  const items = (q.data?.items ?? []).filter((n) => filter === 'all' || !n.read);
  const unread = q.data?.unread ?? 0;

  return (
    <PageShell
      title="Notifications"
      description="Payment requests from the parking gate and other updates about your parking."
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs
          value={filter}
          onChange={setFilter}
          items={[
            { value: 'all', label: 'All' },
            { value: 'unread', label: unread ? `Unread (${unread})` : 'Unread' },
          ]}
        />
        {unread > 0 && (
          <Button variant="outline" size="sm" onClick={markAll}>
            <CheckCheck /> Mark all read
          </Button>
        )}
      </div>

      {q.isPending ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : q.isError ? (
        <Alert variant="destructive">{errorMessage(q.error)}</Alert>
      ) : !items.length ? (
        <Card>
          <CardContent className="grid justify-items-center gap-2 py-10 text-center">
            <Bell className="size-8 text-muted-foreground" aria-hidden />
            <p className="font-medium">
              {filter === 'unread' ? 'You are all caught up.' : 'No notifications yet.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {items.map((n) => {
            const due = n.type === 'GATE_CHARGE_DUE' && !n.read;
            return (
              <Card key={n.id} className={n.read ? '' : 'border-sky-500/50'}>
                <CardContent className="flex flex-wrap items-start gap-3 pt-6">
                  <span
                    className={`mt-1.5 size-2.5 shrink-0 rounded-full ${n.read ? 'bg-transparent' : 'bg-sky-500'}`}
                    aria-label={n.read ? undefined : 'Unread'}
                  />
                  <div className="grid min-w-0 flex-1 gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className={n.read ? 'font-medium' : 'font-semibold'}>{n.title}</p>
                      {n.type === 'GATE_CHARGE_PAID' && <Badge variant="success">Paid</Badge>}
                      {due && <Badge variant="warning">Payment due</Badge>}
                    </div>
                    <p className="text-sm text-muted-foreground">{n.body}</p>
                    <p className="text-xs text-muted-foreground">{fmtDateTime(n.createdAt)}</p>
                  </div>
                  <div className="flex gap-2">
                    {n.link && (
                      <Button size="sm" variant={due ? 'default' : 'outline'} asChild>
                        <Link href={n.link} onClick={() => markRead(n)}>
                          {due && n.amountPaise ? `Pay ${formatRupees(n.amountPaise)}` : 'View'}
                        </Link>
                      </Button>
                    )}
                    {!n.read && !due && (
                      <Button size="sm" variant="ghost" onClick={() => markRead(n)}>
                        Mark read
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </PageShell>
  );
}
