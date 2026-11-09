'use client';

import { useQuery } from '@tanstack/react-query';
import { RADIUS_OPTIONS_METERS } from '@mam/shared-types';
import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { GEO_MESSAGES, useGeolocation } from '@/lib/use-geolocation';
import { MapPinIllustration } from './illustrations';
import { useChosenLocation, useToast } from './providers';
import { Button, Chip, ProviderNotice } from './ui';

function newSessionToken() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : undefined;
}

/** Manual area search (Places Autocomplete via our API). Used when GPS is denied/unavailable or by choice. */
export function ManualLocationSearch({ onDone }: { onDone?: () => void }) {
  const { setLocation, location } = useChosenLocation();
  const toast = useToast();
  const [input, setInput] = useState('');
  const [debounced, setDebounced] = useState('');
  const sessionToken = useMemo(newSessionToken, []);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(input.trim()), 300);
    return () => clearTimeout(t);
  }, [input]);
  const q = useQuery({
    queryKey: ['autocomplete', 'geocode', debounced],
    queryFn: () => api.places.autocomplete({ input: debounced, kind: 'geocode', sessionToken, lat: location?.lat, lng: location?.lng }),
    enabled: debounced.length >= 2,
  });
  async function pick(placeId: string, text: string) {
    try {
      const r = await api.places.geocodePlace(placeId);
      setLocation({ lat: r.location.lat, lng: r.location.lng, label: text, source: 'manual' });
      setInput('');
      onDone?.();
    } catch {
      toast('error', 'Gagal memuat lokasi itu. Coba pilih yang lain.');
    }
  }
  return (
    <div className="relative">
      <label htmlFor="manual-loc" className="sr-only">
        Cari area atau alamat
      </label>
      <input
        id="manual-loc"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="Cari area, mis. Blok M, Dago, Malioboro…"
        autoComplete="off"
        className="h-11 w-full rounded-pill border border-border bg-surface px-4 text-body outline-none focus:border-primary"
      />
      {debounced.length >= 2 && (
        <div className="absolute inset-x-0 top-12 z-30 overflow-hidden rounded-lg border border-border bg-surface shadow-raised">
          {q.isLoading && <p className="px-4 py-3 text-small text-text-muted">Mencari…</p>}
          {q.data && !q.data.provider.ok && <p className="px-4 py-3 text-small text-text-muted">{q.data.provider.message ?? 'Pencarian lokasi sedang tidak tersedia.'}</p>}
          {q.data?.provider.ok && q.data.suggestions.length === 0 && <p className="px-4 py-3 text-small text-text-muted">Tidak ada hasil.</p>}
          <ul role="listbox" aria-label="Saran lokasi">
            {q.data?.suggestions.map((s) => (
              <li key={s.placeId}>
                <button role="option" aria-selected="false" onClick={() => pick(s.placeId, s.text)} className="block w-full px-4 py-2.5 text-left hover:bg-surface-muted">
                  <span className="block text-small font-semibold">{s.text}</span>
                  {s.secondaryText && <span className="block text-caption text-text-muted">{s.secondaryText}</span>}
                </button>
              </li>
            ))}
          </ul>
          <p className="border-t border-border px-4 py-1.5 text-right text-caption text-text-muted">
            {q.data?.provider.provider === 'GOOGLE' ? 'Hasil pencarian oleh Google' : 'Data lokasi © OpenStreetMap contributors'}
          </p>
        </div>
      )}
    </div>
  );
}

export function RadiusSelector() {
  const { radius, setRadius } = useChosenLocation();
  return (
    <div role="group" aria-label="Radius pencarian" className="flex flex-wrap gap-2">
      {RADIUS_OPTIONS_METERS.map((r) => (
        <Chip key={r} selected={radius === r} onClick={() => setRadius(r)}>
          {r / 1000} km
        </Chip>
      ))}
    </div>
  );
}

/** Location gate: asks for GPS only after an explicit tap, with manual fallback. */
export function LocationGate() {
  const { setLocation } = useChosenLocation();
  const geo = useGeolocation();
  const [manual, setManual] = useState(false);
  async function useGps() {
    const r = await geo.request();
    if (r) setLocation({ lat: r.lat, lng: r.lng, label: r.accuracy > 1000 ? 'Lokasi perkiraan' : 'Lokasimu saat ini', source: 'gps', accuracy: r.accuracy });
  }
  const failed = ['denied', 'unavailable', 'timeout', 'unsupported'].includes(geo.status);
  return (
    <div className="card mx-auto flex max-w-xl flex-col items-center gap-3 p-6 text-center">
      <MapPinIllustration className="h-28 w-36" />
      <h2 className="text-h2 font-extrabold">Lapar? Yuk cari yang dekat!</h2>
      <p className="text-small text-text-muted">
        MAM! memakai lokasimu sekali saja untuk mencari tempat makan dalam radius pilihanmu. Kami tidak melacak lokasimu di latar belakang dan tidak menyimpan riwayat lokasi.
      </p>
      <Button onClick={useGps} loading={geo.status === 'requesting'} size="lg">
        📍 Gunakan lokasiku
      </Button>
      {failed && <ProviderNotice message={GEO_MESSAGES[geo.status]} />}
      {failed || manual ? (
        <div className="w-full text-left">
          <ManualLocationSearch />
        </div>
      ) : (
        <button className="text-small font-semibold text-text-muted underline underline-offset-4" onClick={() => setManual(true)}>
          Atau pilih area secara manual
        </button>
      )}
    </div>
  );
}

export function LocationBar() {
  const { location, setLocation } = useChosenLocation();
  const [editing, setEditing] = useState(false);
  if (!location) return null;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 truncate text-small">
          <span aria-hidden>📍</span> <strong>{location.label}</strong>
          {!!location.accuracy && location.accuracy > 1000 && <span className="text-text-muted"> · akurasi ±{Math.round(location.accuracy / 1000)} km</span>}
        </p>
        <div className="flex shrink-0 gap-1">
          <button className="rounded-pill px-3 py-1 text-small font-semibold text-text-muted hover:bg-surface-muted" onClick={() => setEditing((v) => !v)}>
            Ubah
          </button>
          <button className="rounded-pill px-3 py-1 text-small font-semibold text-text-muted hover:bg-surface-muted" onClick={() => setLocation(null)} aria-label="Hapus lokasi">
            ✕
          </button>
        </div>
      </div>
      {editing && <ManualLocationSearch onDone={() => setEditing(false)} />}
    </div>
  );
}
