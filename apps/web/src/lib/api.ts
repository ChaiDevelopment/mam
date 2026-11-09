import { createApiClient } from '@mam/api-client';

/** Browser client — same-origin via Next rewrites, so session cookies are first-party. */
export const api = createApiClient({ baseUrl: '/api/v1' });

/** Server-side base URL (RSC / route handlers). */
export const API_INTERNAL_URL = process.env.API_INTERNAL_URL || 'http://localhost:4000';

export const GOOGLE_MAPS_BROWSER_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY || '';
export const GOOGLE_MAPS_MAP_ID = process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID || 'DEMO_MAP_ID';

export function mapsPlaceUrl(placeId: string, name?: string) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name ?? 'Google')}&query_place_id=${encodeURIComponent(placeId)}`;
}
export function mapsDirectionsUrl(placeId: string, name?: string) {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(name ?? 'Google')}&destination_place_id=${encodeURIComponent(placeId)}`;
}

/** Map tiles for the OpenStreetMap map (used when no Google browser key is set). Use your own tile provider in production. */
export const MAP_TILE_URL = process.env.NEXT_PUBLIC_MAP_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
export const MAP_TILE_ATTRIBUTION =
  process.env.NEXT_PUBLIC_MAP_TILE_ATTRIBUTION || '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors';

/** Navigation links that work for any place (OSM/community places have no Google Place ID). */
export function directionsUrlFor(p: { placeId: string; source?: string; name: string; location: { lat: number; lng: number } }) {
  if (p.source === 'GOOGLE') return mapsDirectionsUrl(p.placeId, p.name);
  return `https://www.google.com/maps/dir/?api=1&destination=${p.location.lat},${p.location.lng}`;
}
export function osmViewUrl(loc: { lat: number; lng: number }) {
  return `https://www.openstreetmap.org/?mlat=${loc.lat}&mlon=${loc.lng}#map=18/${loc.lat}/${loc.lng}`;
}
