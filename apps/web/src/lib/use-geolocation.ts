'use client';

import { useCallback, useState } from 'react';

export type GeoStatus = 'idle' | 'requesting' | 'granted' | 'denied' | 'unavailable' | 'timeout' | 'unsupported';

export interface GeoResult {
  lat: number;
  lng: number;
  accuracy: number;
}

/**
 * One-shot location request — only when the user asks for it. No watchPosition, no background tracking.
 * Approximate location is acceptable (enableHighAccuracy: false); accuracy is surfaced to the UI.
 */
export function useGeolocation(timeoutMs = 10_000) {
  const [status, setStatus] = useState<GeoStatus>('idle');
  const [result, setResult] = useState<GeoResult | null>(null);

  const request = useCallback(
    () =>
      new Promise<GeoResult | null>((resolve) => {
        if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
          setStatus('unsupported');
          return resolve(null);
        }
        setStatus('requesting');
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const r = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy };
            setResult(r);
            setStatus('granted');
            resolve(r);
          },
          (err) => {
            setStatus(err.code === err.PERMISSION_DENIED ? 'denied' : err.code === err.TIMEOUT ? 'timeout' : 'unavailable');
            resolve(null);
          },
          { enableHighAccuracy: false, timeout: timeoutMs, maximumAge: 5 * 60_000 },
        );
      }),
    [timeoutMs],
  );

  return { status, result, request };
}

export const GEO_MESSAGES: Record<GeoStatus, string> = {
  idle: '',
  requesting: 'Mencari lokasimu…',
  granted: '',
  denied: 'Izin lokasi ditolak. Kamu tetap bisa mencari area secara manual di bawah ini.',
  unavailable: 'Lokasi tidak tersedia (GPS mati atau sinyal lemah). Cari area secara manual.',
  timeout: 'Mencari lokasi terlalu lama. Coba lagi atau cari area secara manual.',
  unsupported: 'Peramban ini tidak mendukung lokasi. Cari area secara manual.',
};
