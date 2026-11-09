'use client';

import { APIProvider, AdvancedMarker, Map, Pin, useMap, useMapsLibrary, type MapCameraChangedEvent } from '@vis.gl/react-google-maps';
import type { LatLng, PlaceSummary } from '@mam/shared-types';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { GOOGLE_MAPS_BROWSER_KEY, GOOGLE_MAPS_MAP_ID } from '@/lib/api';
import { OsmMap } from './osm-map';
import { Button } from './ui';

function RadiusCircle({ center, radius }: { center: LatLng; radius: number }) {
  const map = useMap();
  const maps = useMapsLibrary('maps');
  useEffect(() => {
    if (!map || !maps) return;
    const c = new maps.Circle({
      map,
      center,
      radius,
      strokeColor: '#FF9F43',
      strokeOpacity: 0.8,
      strokeWeight: 2,
      fillColor: '#FF9F43',
      fillOpacity: 0.08,
      clickable: false,
    });
    return () => c.setMap(null);
  }, [map, maps, center, radius]);
  return null;
}

function FitRadius({ center, radius }: { center: LatLng; radius: number }) {
  const map = useMap();
  const core = useMapsLibrary('core');
  useEffect(() => {
    if (!map || !core) return;
    const dLat = radius / 111_320;
    const dLng = radius / (111_320 * Math.cos((center.lat * Math.PI) / 180));
    map.fitBounds({ north: center.lat + dLat, south: center.lat - dLat, east: center.lng + dLng, west: center.lng - dLng }, 16);
  }, [map, core, center, radius]);
  return null;
}

export function PlacesMap({
  center,
  radius,
  places,
  onSearchArea,
  className = 'h-[420px]',
}: {
  center: LatLng;
  radius: number;
  places: PlaceSummary[];
  /** Manual map positioning: user pans the map and searches around the new centre. */
  onSearchArea?: (c: LatLng) => void;
  className?: string;
}) {
  const router = useRouter();
  const [moved, setMoved] = useState<LatLng | null>(null);
  const [active, setActive] = useState<string | null>(null);

  // Default: OpenStreetMap (no key, no billing). Google Maps is used only when a browser key is configured.
  if (!GOOGLE_MAPS_BROWSER_KEY) {
    return <OsmMap center={center} radius={radius} places={places} onSearchArea={onSearchArea} className={className} />;
  }
  return (
    <APIProvider apiKey={GOOGLE_MAPS_BROWSER_KEY} language="id" region="ID">
      <div className={`relative overflow-hidden rounded-lg border border-border ${className}`}>
        <Map
          mapId={GOOGLE_MAPS_MAP_ID}
          defaultCenter={center}
          defaultZoom={14}
          gestureHandling="greedy"
          disableDefaultUI
          zoomControl
          clickableIcons={false}
          onCameraChanged={(e: MapCameraChangedEvent) => {
            const c = e.detail.center;
            if (Math.abs(c.lat - center.lat) > 0.002 || Math.abs(c.lng - center.lng) > 0.002) setMoved({ lat: c.lat, lng: c.lng });
          }}
          aria-label="Peta tempat makan di sekitar"
        >
          <FitRadius center={center} radius={radius} />
          <RadiusCircle center={center} radius={radius} />
          <AdvancedMarker position={center} title="Pusat pencarian">
            <div className="h-4 w-4 rounded-full border-2 border-white bg-accent shadow-raised" />
          </AdvancedMarker>
          {places.map((p) => (
            <AdvancedMarker
              key={p.placeId}
              position={p.location}
              title={p.name}
              onClick={() => (active === p.placeId ? router.push(`/tempat/${p.placeId}`) : setActive(p.placeId))}
              zIndex={active === p.placeId ? 10 : 1}
            >
              {active === p.placeId ? (
                <div className="max-w-[180px] animate-pop-in rounded-md bg-surface px-3 py-2 text-caption shadow-raised">
                  <strong className="block truncate">{p.name}</strong>
                  <span className="text-text-muted">Ketuk lagi untuk detail</span>
                </div>
              ) : (
                <Pin background="#FF9F43" borderColor="#E8842A" glyphColor="#ffffff" />
              )}
            </AdvancedMarker>
          ))}
        </Map>
        {moved && onSearchArea && (
          <div className="absolute inset-x-0 top-3 flex justify-center">
            <Button size="sm" onClick={() => (onSearchArea(moved), setMoved(null))} className="shadow-raised">
              🔍 Cari di area ini
            </Button>
          </div>
        )}
      </div>
    </APIProvider>
  );
}
