'use client';

import { useQuery } from '@tanstack/react-query';
import {
  BadgeCheck,
  BarChart3,
  CalendarCheck,
  Car,
  CreditCard,
  FileClock,
  FolderTree,
  LayoutDashboard,
  MapPin,
  MessageSquareWarning,
  ReceiptText,
  Settings,
  ShieldCheck,
  Users,
  Wallet,
} from 'lucide-react';
import { api } from '@/shared/lib/api';
import { useT } from '@/shared/i18n/i18n';
import { RoleSidebar } from '@/shared/layout/role-sidebar';

/** Same query (and cache) as the admin home page, so the counts cost nothing extra there. */
interface Counts {
  pendingKyc: number;
  pendingLocations: number;
  openDisputes: number;
  failedRefunds: number;
}

export function AdminSidebar() {
  const t = useT();
  const c = useQuery({
    queryKey: ['admin-overview'],
    queryFn: () => api<Counts>('/admin/overview'),
    refetchInterval: 60_000,
  }).data;
  return (
    <RoleSidebar
      label="Admin"
      title={t('side.admin.title')}
      subtitle={t('side.admin.subtitle')}
      icon={ShieldCheck}
      roleName={t('side.signedInRole.admin')}
      homeHref="/admin"
      groups={[
        { items: [{ href: '/admin', label: t('side.dashboard'), icon: LayoutDashboard }] },
        {
          title: t('side.group.operations'),
          items: [
            {
              href: '/admin/approvals',
              label: t('side.approvals'),
              icon: BadgeCheck,
              count: c ? c.pendingKyc + c.pendingLocations : 0,
            },
            { href: '/admin/places', label: t('side.places'), icon: MapPin },
            { href: '/admin/users', label: t('side.users'), icon: Users },
            { href: '/admin/bookings', label: t('side.bookings'), icon: CalendarCheck },
            {
              href: '/admin/disputes',
              label: t('side.disputes'),
              icon: MessageSquareWarning,
              count: c?.openDisputes,
            },
          ],
        },
        {
          title: t('side.group.money'),
          items: [
            {
              href: '/admin/payments',
              label: t('side.payments'),
              icon: CreditCard,
              count: c?.failedRefunds,
            },
            { href: '/admin/payouts', label: t('side.payouts'), icon: Wallet },
            { href: '/admin/reports', label: t('side.reports'), icon: BarChart3 },
          ],
        },
        {
          title: t('side.group.setup'),
          items: [
            { href: '/admin/vehicle-types', label: t('side.vehicleTypes'), icon: Car },
            { href: '/admin/categories', label: t('side.categories'), icon: FolderTree },
            { href: '/admin/cancellation-policies', label: t('side.policies'), icon: ReceiptText },
            { href: '/admin/settings', label: t('side.settings'), icon: Settings },
          ],
        },
        {
          title: t('side.group.system'),
          items: [{ href: '/admin/audit', label: t('side.audit'), icon: FileClock }],
        },
      ]}
    />
  );
}
