'use client';

import { BadgeCheck, Building2, CalendarCheck, IndianRupee, LayoutDashboard, MapPin, ScanLine } from 'lucide-react';
import { useT } from '@/shared/i18n/i18n';
import { RoleSidebar } from '@/shared/layout/role-sidebar';

export function OwnerSidebar() {
  const t = useT();
  return (
    <RoleSidebar
      label="Parking owner"
      title={t('side.owner.title')}
      subtitle={t('side.owner.subtitle')}
      icon={Building2}
      roleName={t('side.signedInRole.owner')}
      homeHref="/parking-owner"
      groups={[
        { items: [{ href: '/parking-owner', label: t('side.dashboard'), icon: LayoutDashboard }] },
        {
          title: t('side.group.gate'),
          items: [
            { href: '/parking-owner/scanner', label: t('side.scanner'), icon: ScanLine },
            { href: '/parking-owner/bookings', label: t('side.bookings'), icon: CalendarCheck },
          ],
        },
        {
          title: t('side.group.business'),
          items: [
            { href: '/parking-owner/locations', label: t('side.myPlaces'), icon: MapPin },
            { href: '/parking-owner/earnings', label: t('side.earnings'), icon: IndianRupee },
            { href: '/parking-owner/onboarding', label: t('side.kyc'), icon: BadgeCheck },
          ],
        },
      ]}
    />
  );
}
