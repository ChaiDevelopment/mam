'use client';

import { useMutation } from '@tanstack/react-query';
import { ApiError } from '@mam/api-client';
import { BUDGET_RANGES_IDR, BudgetBuckets, CATEGORY_LABELS_ID, CategorySlugs, type BudgetBucket, type CategorySlug, type SurpriseResponse } from '@mam/shared-types';
import { useState } from 'react';
import { DiceIllustration } from '@/components/illustrations';
import { LocationBar, LocationGate, RadiusSelector } from '@/components/location-picker';
import { GoogleMapsAttribution, OsmAttribution, PlaceCard } from '@/components/place-card';
import { useChosenLocation, useToast } from '@/components/providers';
import { Button, Chip, EmptyState, ProviderNotice } from '@/components/ui';
import { api } from '@/lib/api';

export default function SurprisePage() {
  const { location, radius } = useChosenLocation();
  const toast = useToast();
  const [categories, setCategories] = useState<CategorySlug[]>([]);
  const [budget, setBudget] = useState<BudgetBucket | ''>('');
  const [minRating, setMinRating] = useState<number | ''>('');
  const [openNow, setOpenNow] = useState(false);
  const [seen, setSeen] = useState<string[]>([]);
  const [result, setResult] = useState<SurpriseResponse | null>(null);

  const roll = useMutation({
    mutationFn: (exclude: string[]) =>
      api.places.surprise({ lat: location!.lat, lng: location!.lng, radius, categories, budget: budget || undefined, minCommunityRating: minRating || undefined, openNow: openNow || undefined, excludePlaceIds: exclude.slice(-30) }),
    onSuccess: (r) => {
      setResult(r);
      if (r.pick) setSeen((s) => [...s, r.pick!.placeId]);
    },
    onError: (e) => toast('error', e instanceof ApiError ? e.message : 'Gagal memilih tempat.'),
  });

  if (!location)
    return (
      <div className="container-page pt-6">
        <LocationGate />
      </div>
    );

  const google = result?.providers.find((p) => p.provider === 'GOOGLE');
  return (
    <div className="container-page max-w-2xl space-y-5 pt-6">
      <div className="flex items-center gap-3">
        <DiceIllustration className={`h-16 w-16 ${roll.isPending ? 'animate-wiggle' : ''}`} />
        <div>
          <h1 className="text-h1 font-extrabold">Surprise me!</h1>
          <p className="text-small text-text-muted">Satu rekomendasi acak yang tetap masuk akal — lengkap dengan alasannya.</p>
        </div>
      </div>
      <LocationBar />
      <RadiusSelector />
      <div className="scroll-row" role="group" aria-label="Kategori">
        {CategorySlugs.map((c) => (
          <Chip key={c} selected={categories.includes(c)} onClick={() => setCategories((cs) => (cs.includes(c) ? cs.filter((x) => x !== c) : [...cs, c]))}>
            {CATEGORY_LABELS_ID[c]}
          </Chip>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className="text-small font-semibold">
          Budget
          <select value={budget} onChange={(e) => setBudget(e.target.value as BudgetBucket | '')} className="mt-1 h-10 w-full rounded-md border border-border bg-surface px-3">
            <option value="">Bebas</option>
            {BudgetBuckets.map((b) => (
              <option key={b} value={b}>
                {BUDGET_RANGES_IDR[b].label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-small font-semibold">
          Rating komunitas minimal
          <select value={minRating} onChange={(e) => setMinRating(e.target.value ? Number(e.target.value) : '')} className="mt-1 h-10 w-full rounded-md border border-border bg-surface px-3">
            <option value="">Bebas</option>
            {[3, 3.5, 4, 4.5].map((r) => (
              <option key={r} value={r}>
                {String(r).replace('.', ',')}+
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-end gap-2 pb-2 text-small font-semibold">
          <input type="checkbox" checked={openNow} onChange={(e) => setOpenNow(e.target.checked)} className="h-4 w-4 accent-primary" />
          Hanya yang buka (jika datanya ada)
        </label>
      </div>
      <Button size="lg" className="w-full" onClick={() => roll.mutate(seen)} loading={roll.isPending}>
        🎲 {result ? 'Kocok lagi' : 'Pilihkan untukku!'}
      </Button>

      {google && !google.ok && <ProviderNotice message={google.message ?? 'Google Maps tidak tersedia.'} />}
      {result && !result.pick && <EmptyState title="Tidak ada kandidat" body="Tidak ada tempat yang memenuhi semua syarat di radius ini. Coba longgarkan filter atau perbesar radius." />}
      {result?.pick && (
        <section className="animate-pop-in space-y-3" aria-live="polite">
          <PlaceCard place={result.pick} />
          <div className="card p-4">
            <h2 className="font-extrabold">Kenapa tempat ini?</h2>
            <ul className="mt-2 space-y-1 text-small">
              {result.reasons.map((r, i) => (
                <li key={i}>✓ {r.text}</li>
              ))}
            </ul>
            <p className="mt-2 text-caption text-text-muted">
              Skor transparan: rating (komunitas MAM! diutamakan) 35%, kedekatan 25%, jumlah ulasan 15%, acak 25%. Skor: {result.score?.toFixed(2)} dari {result.candidatesConsidered} kandidat.
            </p>
          </div>
          {result.pick.google.rating !== null && (
            <p className="text-right">
              <GoogleMapsAttribution />
            </p>
          )}
          {result.pick.source === 'OSM' && (
            <p className="text-right">
              <OsmAttribution />
            </p>
          )}
        </section>
      )}
    </div>
  );
}
