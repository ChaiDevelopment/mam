import type { LatLng } from '@mam/shared-types';

const EARTH_RADIUS_M = 6_371_008.8; // IUGG mean Earth radius

/**
 * Great-circle distance using the haversine formula. Used for Google results that are never
 * stored in the database. Database-side distance uses PostGIS geography (ST_Distance / ST_DWithin).
 * Haversine vs. WGS84 spheroid differs by < 0.5% — well within the precision needed for ≤ 10 km radii.
 */
export function haversineMeters(a: LatLng, b: LatLng): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(s)));
}

export function isWithinRadius(center: LatLng, point: LatLng, radiusMeters: number): boolean {
  return haversineMeters(center, point) <= radiusMeters;
}
