'use client';

import { CalendarCheck, Car, Home, Search, UserRound } from 'lucide-react';
import { useT } from '@/shared/i18n/i18n';
import { RoleSidebar } from '@/shared/layout/role-sidebar';

export function DriverSidebar() {
  const t = useT();
  return (
    <RoleSidebar
      label="Vehicle owner"
      title={t('side.driver.title')}
      subtitle={t('side.driver.subtitle')}
      icon={Car}
      roleName={t('side.signedInRole.driver')}
      homeHref="/vehicle-owner"
      groups={[
        { items: [{ href: '/vehicle-owner', label: t('side.home'), icon: Home }] },
        {
          title: t('side.group.parking'),
          items: [
            { href: '/search', label: t('side.findParking'), icon: Search },
            { href: '/vehicle-owner/bookings', label: t('side.myBookings'), icon: CalendarCheck },
          ],
        },
        {
          title: t('side.group.account'),
          items: [
            { href: '/vehicle-owner/vehicles', label: t('side.myVehicles'), icon: Car },
            { href: '/account', label: t('side.profile'), icon: UserRound },
          ],
        },
      ]}
    />
  );
}
