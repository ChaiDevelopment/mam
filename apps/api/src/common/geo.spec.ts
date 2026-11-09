import { haversineMeters, isWithinRadius } from './geo';

describe('haversineMeters', () => {
  it('returns 0 for the same point', () => {
    expect(haversineMeters({ lat: -6.2, lng: 106.8 }, { lat: -6.2, lng: 106.8 })).toBe(0);
  });

  it('matches one degree of longitude at the equator (~111.2 km)', () => {
    expect(haversineMeters({ lat: 0, lng: 0 }, { lat: 0, lng: 1 })).toBeCloseTo(111_195, -1);
  });

  it('measures Monas → Bundaran HI (Jakarta) at ~2.3 km, not naive degree subtraction', () => {
    const monas = { lat: -6.1754, lng: 106.8272 };
    const hi = { lat: -6.1950, lng: 106.8230 };
    const d = haversineMeters(monas, hi);
    expect(d).toBeGreaterThan(2100);
    expect(d).toBeLessThan(2400);
  });

  it('is symmetric', () => {
    const a = { lat: -7.25, lng: 112.75 };
    const b = { lat: -7.3, lng: 112.7 };
    expect(haversineMeters(a, b)).toBeCloseTo(haversineMeters(b, a), 6);
  });

  it('isWithinRadius is inclusive at the boundary and exclusive beyond', () => {
    const c = { lat: 0, lng: 0 };
    const p = { lat: 0, lng: 0.0449 }; // ≈ 4998 m
    expect(isWithinRadius(c, p, 5000)).toBe(true);
    expect(isWithinRadius(c, { lat: 0, lng: 0.0451 }, 5000)).toBe(false);
  });
});
