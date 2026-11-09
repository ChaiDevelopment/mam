'use client';

import { useQuery } from '@tanstack/react-query';
import { formatDistance, formatIdr, formatRating } from '@mam/api-client';
import { CATEGORY_LABELS_ID, type CommunityPlaceCard, type HomeSections } from '@mam/shared-types';
import Link from 'next/link';
import { api } from '@/lib/api';
import { BowlIllustration } from './illustrations';
import { useChosenLocation } from './providers';
import { SectionHeader, Skeleton } from './ui';

const SECTIONS: { key: keyof HomeSections; title: string; subtitle: string }[] = [
  { key: 'trending', title: '🔥 Lagi ramai', subtitle: 'Paling banyak diulas & direaksikan 2 minggu terakhir' },
  { key: 'topRated', title: '⭐ Favorit komunitas', subtitle: 'Rating komunitas MAM! tertinggi (minimal 2 ulasan)' },
  { key: 'budgetFriendly', title: '💸 Ramah kantong', subtitle: 'Median harga ≤ Rp25.000 menurut laporan pengguna' },
  { key: 'hiddenGems', title: '💎 Hidden gems', subtitle: 'Rating tinggi, belum banyak yang tahu' },
  { key: 'recentlyReviewed', title: '🆕 Baru diulas', subtitle: 'Ulasan terbaru dari komunitas' },
  { key: 'recentlyDiscovered', title: '🧭 Baru ditemukan', subtitle: 'Tempat yang baru masuk MAM! bulan ini' },
];

function CommunityCard({ c }: { c: CommunityPlaceCard }) {
  const href = c.restaurant.placeKey ? `/tempat/${c.restaurant.placeKey}` : '#';
  return (
    <Link href={href} className="card block w-56 shrink-0 snap-start overflow-hidden transition-shadow hover:shadow-raised">
      <div className="flex h-24 items-center justify-center bg-primary-soft">
        <BowlIllustration className="h-20 w-24" />
      </div>
      <div className="p-3">
        <h3 className="truncate font-bold">{c.restaurant.name ?? 'Nama tidak tersedia'}</h3>
        <p className="truncate text-caption text-text-muted">
          {[c.restaurant.categories[0] && CATEGORY_LABELS_ID[c.restaurant.categories[0]], c.distanceMeters !== null && formatDistance(c.distanceMeters)].filter(Boolean).join(' · ') || 'Komunitas MAM!'}
        </p>
        <p className="mt-1 text-caption">
          <span className="rounded bg-primary-soft px-1.5 font-bold">MAM!</span> <strong>{formatRating(c.stats.averageOverall)}</strong>{' '}
          <span className="text-text-muted">({c.stats.reviewCount} ulasan)</span>
        </p>
        {c.stats.medianPricePaid !== null && <p className="text-caption text-text-muted">~{formatIdr(c.stats.medianPricePaid)} / orang (laporan)</p>}
      </div>
    </Link>
  );
}

export function CommunitySections() {
  const { location, radius } = useChosenLocation();
  const q = useQuery({
    queryKey: ['home', location?.lat?.toFixed(2), location?.lng?.toFixed(2), radius],
    queryFn: () => api.home({ lat: location?.lat, lng: location?.lng, radius }),
  });
  if (q.isLoading)
    return (
      <div className="space-y-3" aria-busy="true">
        <Skeleton className="h-6 w-48" />
        <div className="scroll-row">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-44 w-56 shrink-0" />
          ))}
        </div>
      </div>
    );
  if (q.error || !q.data) return null;
  const visible = SECTIONS.filter((s) => q.data[s.key].length > 0);
  if (!visible.length)
    return (
      <div className="card p-5 text-small text-text-muted">
        Belum ada ulasan komunitas {location ? 'di sekitar sini' : ''}. Jadilah yang pertama — buka tempat favoritmu dan tulis ulasan! 🍜
      </div>
    );
  return (
    <div className="space-y-8">
      {visible.map((s) => (
        <section key={s.key} aria-labelledby={`sec-${s.key}`}>
          <SectionHeader title={s.title} subtitle={s.subtitle} />
          <div className="scroll-row" id={`sec-${s.key}`}>
            {q.data[s.key].map((c) => (
              <CommunityCard key={c.restaurant.id} c={c} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
