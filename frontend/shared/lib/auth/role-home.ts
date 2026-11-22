import type { Role } from '@qp/types';

/** Where each role lands after sign-in. */
export function homeFor(role: Role | null): string {
  switch (role) {
    case 'VEHICLE_OWNER':
      return '/vehicle-owner';
    case 'PARKING_OWNER':
      return '/parking-owner';
    case 'SUPER_ADMIN':
      return '/admin';
    default:
      return '/choose-role';
  }
}

/** Only allow same-site relative redirects (prevents open redirects via ?next=). */
export function safeNext(next: string | null | undefined): string | null {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : null;
}
