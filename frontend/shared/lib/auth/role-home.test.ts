import { describe, expect, it } from 'vitest';
import { homeFor, safeNext } from './role-home';

describe('homeFor', () => {
  it('routes each role to its area, and role-less users to choose-role', () => {
    expect(homeFor('VEHICLE_OWNER')).toBe('/vehicle-owner');
    expect(homeFor('PARKING_OWNER')).toBe('/parking-owner');
    expect(homeFor('SUPER_ADMIN')).toBe('/admin');
    expect(homeFor(null)).toBe('/choose-role');
  });
});

describe('safeNext', () => {
  it('allows only same-site relative paths', () => {
    expect(safeNext('/vehicle-owner/bookings')).toBe('/vehicle-owner/bookings');
    expect(safeNext('//evil.com')).toBeNull();
    expect(safeNext('https://evil.com')).toBeNull();
    expect(safeNext(null)).toBeNull();
  });
});
