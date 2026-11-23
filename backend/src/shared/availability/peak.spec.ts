import { peakIn } from './availability.service';

const t = (h: number) => new Date(Date.UTC(2026, 0, 1, h));
const iv = (s: number, e: number, w = 1) => ({ s: t(s), e: t(e), w });

describe('peakIn (calendar sweep)', () => {
  it('is 0 with nothing booked', () => expect(peakIn([], t(0), t(24))).toBe(0));
  it('counts overlapping bookings', () => expect(peakIn([iv(1, 5), iv(2, 6), iv(3, 4)], t(0), t(24))).toBe(3));
  it('treats intervals as half-open: back-to-back bookings share a slot', () => expect(peakIn([iv(1, 2), iv(2, 3)], t(0), t(24))).toBe(1));
  it('weights capacity blocks by their slots', () => expect(peakIn([iv(1, 5, 4), iv(2, 3)], t(0), t(24))).toBe(5));
  it('ignores intervals outside the window and clips ones crossing it', () => {
    expect(peakIn([iv(0, 2), iv(10, 12)], t(3), t(9))).toBe(0);
    expect(peakIn([iv(0, 5), iv(4, 12)], t(3), t(9))).toBe(2);
  });
});
