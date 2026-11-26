'use client';

import type { NotificationListDto } from '@qp/types';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { api } from '@/shared/lib/api';
import { fmtDateTime, formatRupees } from '@/shared/lib/format';

/** The signed-in user's notifications, shared by the header bell, the sidebar menu and the page. */
export const useNotifications = () =>
  useQuery({
    queryKey: ['notifications'],
    queryFn: () => api<NotificationListDto>('/notifications'),
    refetchInterval: 15_000,
  });

/** Header bell: the signed-in user's in-app notifications (e.g. an overstay charge to pay). */
export function NotificationBell({ className = '' }: { className?: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const q = useNotifications();
  const unread = q.data?.unread ?? 0;

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  const markAll = async () => {
    await api('/notifications/read-all', { body: {} }).catch(() => undefined);
    void qc.invalidateQueries({ queryKey: ['notifications'] });
  };
  const openOne = (id: string) => {
    setOpen(false);
    void api(`/notifications/${id}/read`, { body: {} })
      .catch(() => undefined)
      .then(() => qc.invalidateQueries({ queryKey: ['notifications'] }));
  };

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={unread ? `Notifications (${unread} unread)` : 'Notifications'}
        aria-expanded={open}
        className={`relative inline-flex size-9 items-center justify-center rounded-md ${className}`}
      >
        <Bell className="size-[18px]" aria-hidden />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex min-w-[18px] items-center justify-center rounded-full bg-destructive px-1 text-[11px] leading-[18px] font-semibold text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-lg border bg-card text-card-foreground shadow-xl">
          <div className="flex items-center justify-between border-b px-4 py-2.5">
            <Link
              href="/vehicle-owner/notifications"
              onClick={() => setOpen(false)}
              className="text-sm font-semibold hover:underline"
            >
              Notifications
            </Link>
            {unread > 0 && (
              <button
                type="button"
                onClick={markAll}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Mark all read
              </button>
            )}
          </div>
          <div className="max-h-[60vh] overflow-y-auto">
            {!q.data?.items.length ? (
              <p className="px-4 py-6 text-center text-sm text-muted-foreground">
                No notifications yet.
              </p>
            ) : (
              q.data.items.map((n) => {
                const body = (
                  <div className="grid gap-0.5">
                    <div className="flex items-start gap-2">
                      {!n.read && (
                        <span
                          className="mt-1.5 size-2 shrink-0 rounded-full bg-sky-500"
                          aria-label="Unread"
                        />
                      )}
                      <span className={`text-sm ${n.read ? '' : 'font-semibold'}`}>{n.title}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">{n.body}</span>
                    <span className="flex items-center justify-between text-[11px] text-muted-foreground">
                      {fmtDateTime(n.createdAt)}
                      {n.type === 'GATE_CHARGE_DUE' && !n.read && n.amountPaise ? (
                        <span className="rounded bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground">
                          Pay {formatRupees(n.amountPaise)}
                        </span>
                      ) : null}
                    </span>
                  </div>
                );
                return n.link ? (
                  <Link
                    key={n.id}
                    href={n.link}
                    onClick={() => openOne(n.id)}
                    className="block border-b px-4 py-3 last:border-0 hover:bg-muted/50"
                  >
                    {body}
                  </Link>
                ) : (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => openOne(n.id)}
                    className="block w-full border-b px-4 py-3 text-left last:border-0 hover:bg-muted/50"
                  >
                    {body}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
