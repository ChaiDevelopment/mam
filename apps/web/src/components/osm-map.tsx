'use client';

import type { LatLng, PlaceSummary } from '@mam/shared-types';
import type * as Leaflet from 'leaflet';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { MAP_TILE_ATTRIBUTION, MAP_TILE_URL } from '@/lib/api';
import { Button } from './ui';

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function pinIcon(L: typeof Leaflet, kind: 'place' | 'active' | 'center' | 'pick') {
  const html =
    kind === 'center'
      ? '<div class="h-4 w-4 rounded-full border-2 border-white bg-accent shadow-raised"></div>'
      : kind === 'pick'
        ? '<div class="text-[32px] leading-none drop-shadow">📍</div>'
        : `<div class="flex h-7 w-7 items-center justify-center rounded-full border-2 border-white ${kind === 'active' ? 'bg-accent' : 'bg-primary'} text-[13px] shadow-raised">🍽️</div>`;
  const size = kind === 'center' ? 16 : kind === 'pick' ? 32 : 28;
  return L.divIcon({ html, className: 'mam-pin', iconSize: [size, size], iconAnchor: kind === 'pick' ? [16, 32] : [size / 2, size / 2] });
}

/**
 * OpenStreetMap map (Leaflet). Shows places + search radius, supports "search this area", and — with `onPick` —
 * works as a location picker (tap/drag to choose a point).
 */
const NO_PLACES: PlaceSummary[] = [];

export function OsmMap({
  center,
  radius,
  places = NO_PLACES,
  onSearchArea,
  onPick,
  picked,
  className = 'h-[420px]',
}: {
  center: LatLng;
  radius?: number;
  places?: PlaceSummary[];
  onSearchArea?: (c: LatLng) => void;
  onPick?: (c: LatLng) => void;
  picked?: LatLng | null;
  className?: string;
}) {
  const router = useRouter();
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Leaflet.Map | null>(null);
  const LRef = useRef<typeof Leaflet | null>(null);
  const layerRef = useRef<Leaflet.LayerGroup | null>(null);
  const pickRef = useRef<Leaflet.Marker | null>(null);
  const [ready, setReady] = useState(false);
  const [moved, setMoved] = useState<LatLng | null>(null);
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;
  const pickMode = !!onPick;
  const routerRef = useRef(router);
  routerRef.current = router;

  // Create the map once (Leaflet needs `window`, so it is imported on the client only).
  useEffect(() => {
    let disposed = false;
    void import('leaflet').then((mod) => {
      const L = (mod as unknown as { default?: typeof Leaflet }).default ?? (mod as unknown as typeof Leaflet);
      if (disposed || !el.current || mapRef.current) return;
      LRef.current = L;
      const map = L.map(el.current, { zoomControl: true, attributionControl: true }).setView([center.lat, center.lng], 14);
      L.tileLayer(MAP_TILE_URL, { maxZoom: 19, attribution: MAP_TILE_ATTRIBUTION }).addTo(map);
      map.attributionControl.setPrefix(false);
      layerRef.current = L.layerGroup().addTo(map);
      map.on('moveend', () => {
        const c = map.getCenter();
        setMoved((m) => (m && m.lat === c.lat && m.lng === c.lng ? m : { lat: c.lat, lng: c.lng }));
      });
      map.on('click', (e: Leaflet.LeafletMouseEvent) => onPickRef.current?.({ lat: e.latlng.lat, lng: e.latlng.lng }));
      mapRef.current = map;
      setReady(true);
    });
    return () => {
      disposed = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Centre, radius circle and place markers.
  useEffect(() => {
    const L = LRef.current;
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!ready || !L || !map || !layer) return;
    layer.clearLayers();
    if (radius) {
      const circle = L.circle([center.lat, center.lng], { radius, color: '#FF9F43', weight: 2, opacity: 0.8, fillColor: '#FF9F43', fillOpacity: 0.08, interactive: false }).addTo(layer);
      map.fitBounds(circle.getBounds(), { maxZoom: 17, animate: false });
    } else {
      map.setView([center.lat, center.lng], Math.max(map.getZoom(), 16), { animate: false });
    }
    if (!pickMode) L.marker([center.lat, center.lng], { icon: pinIcon(L, 'center'), title: 'Pusat pencarian', keyboard: false, interactive: false }).addTo(layer);
    for (const p of places) {
      const m = L.marker([p.location.lat, p.location.lng], { icon: pinIcon(L, 'place'), title: p.name, alt: p.name }).addTo(layer);
      m.bindPopup(
        `<div style="min-width:160px"><strong>${escapeHtml(p.name)}</strong>${p.address ? `<br><span style="color:#858585">${escapeHtml(p.address)}</span>` : ''}<br><a href="/tempat/${encodeURIComponent(p.placeId)}" data-place="${encodeURIComponent(p.placeId)}">Lihat detail →</a></div>`,
      );
      m.on('popupopen', (e) => {
        const a = (e.popup.getElement() as HTMLElement | undefined)?.querySelector<HTMLAnchorElement>('a[data-place]');
        a?.addEventListener('click', (ev) => {
          ev.preventDefault();
          routerRef.current.push(`/tempat/${a.dataset.place}`);
        });
      });
    }
    // Reset "search this area" after programmatic moves (functional update: no re-render when already null).
    const t = setTimeout(() => setMoved((m) => (m === null ? m : null)), 50);
    return () => clearTimeout(t);
    // Deps are primitives/stable refs only — a new array or callback per render must not re-run this effect.
  }, [ready, center.lat, center.lng, radius, places, pickMode]);

  // Picked point for the location picker.
  useEffect(() => {
    const L = LRef.current;
    const map = mapRef.current;
    if (!ready || !L || !map) return;
    if (!picked) {
      pickRef.current?.remove();
      pickRef.current = null;
      return;
    }
    if (!pickRef.current) {
      pickRef.current = L.marker([picked.lat, picked.lng], { icon: pinIcon(L, 'pick'), draggable: true, title: 'Lokasi tempat' }).addTo(map);
      pickRef.current.on('dragend', () => {
        const ll = pickRef.current!.getLatLng();
        onPickRef.current?.({ lat: ll.lat, lng: ll.lng });
      });
    } else {
      pickRef.current.setLatLng([picked.lat, picked.lng]);
    }
  }, [ready, picked]);

  const showSearchArea = !!onSearchArea && !!moved && (Math.abs(moved.lat - center.lat) > 0.002 || Math.abs(moved.lng - center.lng) > 0.002);

  return (
    <div className={`relative z-0 overflow-hidden rounded-lg border border-border ${className}`}>
      <div ref={el} className="h-full w-full" role="application" aria-label={onPick ? 'Peta untuk memilih lokasi tempat' : 'Peta tempat makan di sekitar'} />
      {showSearchArea && (
        <div className="absolute inset-x-0 top-3 z-[1000] flex justify-center">
          <Button size="sm" onClick={() => (onSearchArea!(moved!), setMoved(null))} className="shadow-raised">
            🔍 Cari di area ini
          </Button>
        </div>
      )}
    </div>
  );
}
