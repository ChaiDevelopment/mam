'use client';

import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { DiscoveryPanel, PlaceList } from '@/components/discovery';
import { GoogleMapsAttribution } from '@/components/place-card';
import { useChosenLocation } from '@/components/providers';
import { ProviderNotice } from '@/components/ui';
import { api } from '@/lib/api';

export default function ExplorePage() {
  const { location, radius } = useChosenLocation();
  const [text, setText] = useState('');
  const [query, setQuery] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setQuery(text.trim()), 400);
    return () => clearTimeout(t);
  }, [text]);
  const search = useQuery({
    queryKey: ['search', query, location?.lat, location?.lng, radius],
    queryFn: () => api.places.search({ q: query, lat: location?.lat, lng: location?.lng, radius }),
    enabled: query.length >= 2,
  });
  const google = search.data?.providers.find((p) => p.provider === 'GOOGLE');

  return (
    <div className="container-page space-y-6 pt-6">
      <h1 className="text-h1 font-extrabold">Jelajah</h1>
      <div role="search">
        <label htmlFor="q" className="sr-only">
          Cari tempat makan
        </label>
        <input
          id="q"
          type="search"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Cari nama tempat atau makanan, mis. mie ayam, sate padang…"
          className="h-12 w-full rounded-pill border border-border bg-surface px-5 text-body shadow-card outline-none focus:border-primary"
        />
      </div>
      {query.length >= 2 ? (
        <section aria-label="Hasil pencarian" className="space-y-3">
          {google && !google.ok && <ProviderNotice message={google.message ?? 'Pencarian Google sedang tidak tersedia.'} />}
          <PlaceList items={search.data?.items} loading={search.isLoading} error={search.error} onRetry={() => search.refetch()} emptyText="Tidak ada hasil untuk kata kunci itu." />
          {!!search.data?.items.length && (
            <p className="text-right">
              <GoogleMapsAttribution />
            </p>
          )}
        </section>
      ) : (
        <DiscoveryPanel full />
      )}
    </div>
  );
}
