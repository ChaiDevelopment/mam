'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ApiError } from '@mam/api-client';
import {
  BUDGET_RANGES_IDR,
  BudgetBuckets,
  CATEGORY_LABELS_ID,
  CategorySlugs,
  type BudgetBucket,
  type CategorySlug,
  type PlaceSummary,
  type SortOption,
} from '@mam/shared-types';
import Link from 'next/link';
import { useState } from 'react';
import { api } from '@/lib/api';
import { LocationBar, LocationGate, RadiusSelector } from './location-picker';
import { GoogleMapsAttribution, OsmAttribution, PlaceCard } from './place-card';
import { PlacesMap } from './places-map';
import { useChosenLocation } from './providers';
import { Button, CardSkeleton, Chip, EmptyState, ErrorState, ProviderNotice } from './ui';

export const SORT_LABELS: Record<SortOption, string> = {
  NEAREST: 'Terdekat',
  COMMUNITY_RATING: 'Rating komunitas tertinggi',
  MOST_REVIEWED: 'Paling banyak diulas',
  RECENTLY_REVIEWED: 'Baru diulas',
};

export interface Filters {
  categories: CategorySlug[];
  budget?: BudgetBucket;
  sort: SortOption;
  openNow: boolean;
  minRating?: number;
}

export const PAGE_SIZE = 100;
/** The map shows up to this many pins (nearest first). */
export const MAP_LIMIT = 1000;

export function useNearby(filters: Filters, limit: number = PAGE_SIZE) {
  const { location, radius } = useChosenLocation();
  return useQuery({
    queryKey: ['nearby', location?.lat, location?.lng, radius, filters, limit],
    queryFn: () =>
      api.places.nearby({
        lat: location!.lat,
        lng: location!.lng,
        radius,
        categories: filters.categories,
        budget: filters.budget,
        sort: filters.sort,
        openNow: filters.openNow || undefined,
        minRating: filters.minRating,
        limit,
      }),
    enabled: !!location,
    placeholderData: keepPreviousData,
  });
}

export function PlaceList({ items, loading, error, onRetry, emptyText }: { items?: PlaceSummary[]; loading: boolean; error?: unknown; onRetry?: () => void; emptyText?: string }) {
  if (loading)
    return (
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2" aria-busy="true" aria-label="Memuat tempat">
        {Array.from({ length: 6 }, (_, i) => (
          <CardSkeleton key={i} />
        ))}
      </div>
    );
  if (error) return <ErrorState message={error instanceof ApiError ? error.message : undefined} onRetry={onRetry} />;
  if (!items?.length) return <EmptyState title="Belum ada tempat yang cocok" body={emptyText ?? 'Coba perbesar radius atau longgarkan filter.'} />;
  return (
    <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
      {items.map((p) => (
        <li key={p.placeId} className="min-w-0">
          <PlaceCard place={p} />
        </li>
      ))}
    </ul>
  );
}

export function DiscoveryPanel({ full = false }: { full?: boolean }) {
  const { location, setLocation, radius } = useChosenLocation();
  const [view, setView] = useState<'list' | 'map'>('list');
  const [filters, setFilters] = useState<Filters>({ categories: [], sort: 'NEAREST', openNow: false });
  const [pages, setPages] = useState(1);
  // Start again from the first page whenever the search area or filters change.
  const resetKey = `${location?.lat},${location?.lng},${radius},${JSON.stringify(filters)}`;
  const [lastKey, setLastKey] = useState(resetKey);
  if (lastKey !== resetKey) {
    setLastKey(resetKey);
    setPages(1);
  }
  const q = useNearby(filters, view === 'map' ? MAP_LIMIT : PAGE_SIZE * pages);

  if (!location) return <LocationGate />;
  const toggleCat = (c: CategorySlug) =>
    setFilters((f) => ({ ...f, categories: f.categories.includes(c) ? f.categories.filter((x) => x !== c) : [...f.categories, c] }));
  const items = full ? q.data?.items : q.data?.items.slice(0, 6);
  const google = q.data?.providers.find((p) => p.provider === 'GOOGLE');
  // "Open now" needs reliable live data, which only Google provides; OSM opening_hours is not evaluated.
  const openNowAvailable = !!google?.ok;

  return (
    <section aria-label="Tempat makan di sekitar" className="space-y-4">
      <LocationBar />
      <RadiusSelector />
      <div className="scroll-row" role="group" aria-label="Kategori">
        {CategorySlugs.map((c) => (
          <Chip key={c} selected={filters.categories.includes(c)} onClick={() => toggleCat(c)}>
            {CATEGORY_LABELS_ID[c]}
          </Chip>
        ))}
      </div>

      {full && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="text-small font-semibold">
            Budget
            <select
              className="mt-1 h-10 w-full rounded-md border border-border bg-surface px-3"
              value={filters.budget ?? ''}
              onChange={(e) => setFilters((f) => ({ ...f, budget: (e.target.value || undefined) as BudgetBucket | undefined }))}
            >
              <option value="">Semua budget</option>
              {BudgetBuckets.map((b) => (
                <option key={b} value={b}>
                  {BUDGET_RANGES_IDR[b].label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-small font-semibold">
            Urutkan
            <select className="mt-1 h-10 w-full rounded-md border border-border bg-surface px-3" value={filters.sort} onChange={(e) => setFilters((f) => ({ ...f, sort: e.target.value as SortOption }))}>
              {Object.entries(SORT_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label className="text-small font-semibold">
            Rating komunitas MAM! minimal
            <select
              className="mt-1 h-10 w-full rounded-md border border-border bg-surface px-3"
              value={filters.minRating ?? ''}
              onChange={(e) => setFilters((f) => ({ ...f, minRating: e.target.value ? Number(e.target.value) : undefined }))}
            >
              <option value="">Semua</option>
              {[3, 3.5, 4, 4.5].map((r) => (
                <option key={r} value={r}>
                  {String(r).replace('.', ',')}+
                </option>
              ))}
            </select>
          </label>
          {openNowAvailable && (
            <label className="flex items-center gap-2 text-small font-semibold">
              <input type="checkbox" className="h-4 w-4 accent-primary" checked={filters.openNow} onChange={(e) => setFilters((f) => ({ ...f, openNow: e.target.checked }))} />
              Buka sekarang (data Google)
            </label>
          )}
        </div>
      )}
      {full && filters.budget && (
        <p className="text-caption text-text-muted">
          Budget dicocokkan dengan harga yang dilaporkan komunitas MAM! atau rentang harga dari Google Maps. Tempat tanpa data harga tidak ditampilkan — kami tidak menebak harga.
        </p>
      )}

      <div className="flex items-center justify-between">
        <p className="text-small text-text-muted" aria-live="polite">
          {q.data ? `${q.data.total.toLocaleString('id-ID')} tempat dalam ${radius / 1000} km` : ' '}
          {q.data && view === 'map' && q.data.hasMore && ` · peta menampilkan ${q.data.items.length.toLocaleString('id-ID')} terdekat`}
          {q.data && q.data.excludedForMissingData > 0 && ` · ${q.data.excludedForMissingData} disembunyikan karena datanya belum ada`}
        </p>
        <div role="tablist" aria-label="Tampilan" className="flex rounded-pill border border-border bg-surface p-0.5">
          {(['list', 'map'] as const).map((v) => (
            <button
              key={v}
              role="tab"
              aria-selected={view === v}
              onClick={() => setView(v)}
              className={`rounded-pill px-3 py-1 text-small font-semibold ${view === v ? 'bg-primary text-on-primary' : 'text-text-muted'}`}
            >
              {v === 'list' ? 'Daftar' : 'Peta'}
            </button>
          ))}
        </div>
      </div>

      {google && !google.ok && <ProviderNotice message={google.message ?? 'Google Maps sedang tidak tersedia.'} />}

      {view === 'map' ? (
        <PlacesMap
          center={location}
          radius={radius}
          places={q.data?.items ?? []}
          onSearchArea={(c) => setLocation({ lat: c.lat, lng: c.lng, label: 'Area pilihan di peta', source: 'manual' })}
        />
      ) : (
        <>
          <PlaceList items={items} loading={q.isLoading} error={q.error} onRetry={() => q.refetch()} />
          {full && q.data?.hasMore && (
            <div className="flex flex-col items-center gap-1">
              <Button variant="outline" onClick={() => setPages((p) => p + 1)} loading={q.isFetching}>
                Tampilkan lebih banyak
              </Button>
              <span className="text-caption text-text-muted">
                Menampilkan {q.data.items.length.toLocaleString('id-ID')} dari {q.data.total.toLocaleString('id-ID')} tempat
              </span>
            </div>
          )}
        </>
      )}
      {(q.data?.items.some((i) => i.google.rating !== null || i.photo) || q.data?.items.some((i) => i.source === 'OSM')) && (
        <p className="flex justify-end gap-3 text-right">
          {q.data?.items.some((i) => i.source === 'OSM') && <OsmAttribution />}
          {q.data?.items.some((i) => i.google.rating !== null || i.photo) && <GoogleMapsAttribution />}
        </p>
      )}
      <p className="text-center text-small text-text-muted">
        Tempat favoritmu belum ada?{' '}
        <Link href="/tambah-tempat" className="tap font-bold text-text underline underline-offset-4">
          Tambahkan tempat
        </Link>
      </p>
    </section>
  );
}
