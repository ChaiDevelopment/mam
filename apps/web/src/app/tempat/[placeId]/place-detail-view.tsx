'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, formatDate, formatDistance, formatIdr, formatRating } from '@mam/api-client';
import { CATEGORY_LABELS_ID, OSM_ATTRIBUTION, OSM_COPYRIGHT_URL, type PlaceDetail, type PlatformLinkView, type ProviderStatus } from '@mam/shared-types';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { BowlIllustration } from '@/components/illustrations';
import { BrandThumb, GoogleMapsAttribution, GooglePhoto, MediaCreditLine, PlaceCard, PriceInfo } from '@/components/place-card';
import { PlacesMap } from '@/components/places-map';
import { useAuth, useChosenLocation, useToast } from '@/components/providers';
import { ReviewCard } from '@/components/review-card';
import { Avatar, Button, EmptyState, ErrorState, LinkButton, Modal, ProviderNotice, Skeleton, SourceTag, Stars } from '@/components/ui';
import { api, directionsUrlFor, mapsPlaceUrl, osmViewUrl } from '@/lib/api';

function useRestaurantId(place: PlaceDetail | undefined) {
  const qc = useQueryClient();
  return async (): Promise<string> => {
    if (place?.restaurantId) return place.restaurantId;
    const r = await api.restaurants.resolve(place!.placeId);
    qc.setQueryData(['place', place!.placeId], (old: { place: PlaceDetail; provider: ProviderStatus } | undefined) => (old ? { ...old, place: { ...old.place, restaurantId: r.id } } : old));
    return r.id;
  };
}

export function PlaceDetailView({ placeId, initial }: { placeId: string; initial: { place: PlaceDetail; provider: ProviderStatus } | null }) {
  const { location } = useChosenLocation();
  const q = useQuery({
    queryKey: ['place', placeId],
    queryFn: () => api.places.detail(placeId, location ? { lat: location.lat, lng: location.lng } : undefined),
    initialData: initial ?? undefined,
    staleTime: 0,
  });

  if (q.isLoading)
    return (
      <div className="container-page space-y-4 pt-6" aria-busy="true">
        <Skeleton className="h-56 w-full" />
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-4 w-1/2" />
      </div>
    );
  if (q.error || !q.data)
    return (
      <div className="container-page pt-6">
        <ErrorState message={q.error instanceof ApiError ? q.error.message : 'Detail tempat tidak dapat dimuat.'} onRetry={() => q.refetch()} />
      </div>
    );
  const { place, provider } = q.data;
  return (
    <div className="container-page space-y-8 pt-4">
      {!provider.ok && <ProviderNotice message={provider.message ?? 'Data Google Maps sedang tidak tersedia; menampilkan data komunitas MAM!.'} />}
      <Hero place={place} />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-8">
          <RatingsComparison place={place} />
          <CommunityReviews place={place} />
          {place.source === 'GOOGLE' && <GoogleReviews placeId={place.placeId} />}
        </div>
        <aside className="space-y-6">
          <InfoPanel place={place} />
          <DeliveryPanel restaurantId={place.restaurantId} />
          <Alternatives place={place} />
        </aside>
      </div>
    </div>
  );
}

function Hero({ place }: { place: PlaceDetail }) {
  const { me, loading: authLoading } = useAuth();
  const toast = useToast();
  const router = useRouter();
  const qc = useQueryClient();
  const resolveId = useRestaurantId(place);
  const [collectionOpen, setCollectionOpen] = useState(false);
  const fav = useQuery({ queryKey: ['favorite', place.restaurantId], queryFn: () => api.favorites.status(place.restaurantId!), enabled: !!me && !!place.restaurantId });
  const toggleFav = useMutation({
    mutationFn: async () => {
      const id = await resolveId();
      if (fav.data?.favorited) await api.favorites.remove(id);
      else await api.favorites.add(id);
      return id;
    },
    onSuccess: (id) => {
      toast('success', fav.data?.favorited ? 'Dihapus dari favorit' : 'Disimpan ke favorit ❤️');
      qc.invalidateQueries({ queryKey: ['favorite', id] });
      qc.invalidateQueries({ queryKey: ['favorite', place.restaurantId] });
      qc.invalidateQueries({ queryKey: ['favorites'] });
    },
    onError: (e) => toast('error', e instanceof ApiError ? e.message : 'Gagal menyimpan favorit.'),
  });
  const requireLogin = (fn: () => void) => () => (me ? fn() : router.push(`/masuk?next=/tempat/${place.placeId}`));
  async function share() {
    const url = `${window.location.origin}/tempat/${place.placeId}`;
    try {
      if (navigator.share) await navigator.share({ title: `${place.name} · MAM!`, text: `Cek ${place.name} di MAM!`, url });
      else {
        await navigator.clipboard.writeText(url);
        toast('success', 'Tautan disalin!');
      }
    } catch {
      /* user cancelled */
    }
  }
  return (
    <section aria-labelledby="place-name">
      <div className="grid gap-2 overflow-hidden rounded-xl sm:grid-cols-3 sm:grid-rows-2">
        {place.photos.length ? (
          place.photos.slice(0, 3).map((p, i) => (
            <GooglePhoto key={p.name} photo={p} alt={`Foto ${place.name} ${i + 1}`} maxWidth={i === 0 ? 1000 : 500} className={i === 0 ? 'h-56 sm:col-span-2 sm:row-span-2 sm:h-80' : 'hidden h-full sm:block'} />
          ))
        ) : place.local?.brand?.image || place.local?.brand?.logo ? (
          <div className="flex h-48 items-center justify-center overflow-hidden bg-primary-soft sm:col-span-3 sm:row-span-2 sm:h-64">
            <BrandThumb place={place} className={place.local.brand.image && !place.local.brand.logo ? '' : 'max-h-40 max-w-xs rounded-lg'} />
          </div>
        ) : (
          <div className="flex h-48 items-center justify-center bg-primary-soft sm:col-span-3 sm:row-span-2">
            <BowlIllustration className="h-36 w-44" />
          </div>
        )}
      </div>
      {place.photos.length > 0 && <p className="mt-1 text-right"><SourceTag source="google" /></p>}
      {!place.photos.length && place.local?.brand && (place.local.brand.logo || place.local.brand.image) && (
        <p className="mt-1 text-right">
          <MediaCreditLine credit={(place.local.brand.logo ?? place.local.brand.image)!} label={place.local.brand.logo ? 'Logo' : 'Foto'} />
        </p>
      )}
      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 id="place-name" className="text-h1 font-extrabold">
            {place.name}
          </h1>
          <p className="text-small text-text-muted">
            {[place.categories.map((c) => CATEGORY_LABELS_ID[c]).join(', '), place.distanceMeters !== null ? formatDistance(place.distanceMeters) : null].filter(Boolean).join(' · ')}
          </p>
          {place.address && <p className="mt-1 text-small">{place.address}</p>}
          <div className="mt-1 flex flex-wrap gap-3 text-small">
            {place.openNow !== null && <span className={place.openNow ? 'font-semibold text-success' : 'text-text-muted'}>{place.openNow ? '● Buka sekarang' : '● Tutup'}</span>}
            <PriceInfo place={place} />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <LinkButton href={`/tempat/${place.placeId}/ulas`}>✍️ Tulis ulasan</LinkButton>
          <Button variant="outline" onClick={requireLogin(() => toggleFav.mutate())} loading={toggleFav.isPending} disabled={authLoading || (!!me && !!place.restaurantId && fav.isLoading)} aria-pressed={!!fav.data?.favorited}>
            {fav.data?.favorited ? '❤️ Favorit' : '🤍 Simpan'}
          </Button>
          <Button variant="outline" onClick={requireLogin(() => setCollectionOpen(true))} disabled={authLoading}>
            📚 Koleksi
          </Button>
          <Button variant="ghost" onClick={share} aria-label="Bagikan">
            🔗 Bagikan
          </Button>
        </div>
      </div>
      <AddToCollection open={collectionOpen} onClose={() => setCollectionOpen(false)} place={place} />
    </section>
  );
}

function AddToCollection({ open, onClose, place }: { open: boolean; onClose: () => void; place: PlaceDetail }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const cols = useQuery({ queryKey: ['collections'], queryFn: api.collections.mine, enabled: open });
  const add = useMutation({
    mutationFn: (id: string) => api.collections.addItem(id, place.restaurantId ? { restaurantId: place.restaurantId } : { googlePlaceId: place.placeId }),
    onSuccess: () => {
      toast('success', 'Ditambahkan ke koleksi 📚');
      qc.invalidateQueries({ queryKey: ['collections'] });
      onClose();
    },
    onError: (e) => toast('error', e instanceof ApiError ? e.message : 'Gagal menambahkan.'),
  });
  const create = useMutation({
    mutationFn: () => api.collections.create({ name, isPublic: false }),
    onSuccess: (c) => {
      setName('');
      add.mutate(c.id);
    },
    onError: (e) => toast('error', e instanceof ApiError ? e.message : 'Gagal membuat koleksi.'),
  });
  return (
    <Modal open={open} onClose={onClose} title="Simpan ke koleksi">
      {cols.isLoading && <Skeleton className="h-10 w-full" />}
      <ul className="space-y-2">
        {cols.data?.map((c) => (
          <li key={c.id}>
            <button onClick={() => add.mutate(c.id)} disabled={add.isPending} className="flex w-full items-center justify-between rounded-md border border-border px-3 py-2 text-left hover:bg-surface-muted">
              <span className="font-semibold">{c.name}</span>
              <span className="text-caption text-text-muted">{c.itemCount} tempat</span>
            </button>
          </li>
        ))}
      </ul>
      <form
        className="mt-4 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) create.mutate();
        }}
      >
        <label htmlFor="new-col" className="sr-only">
          Nama koleksi baru
        </label>
        <input id="new-col" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="Koleksi baru, mis. Ngopi santai" className="h-11 flex-1 rounded-pill border border-border px-4" />
        <Button type="submit" loading={create.isPending}>
          Buat
        </Button>
      </form>
    </Modal>
  );
}

function RatingsComparison({ place }: { place: PlaceDetail }) {
  const stats = useQuery({ queryKey: ['stats', place.restaurantId], queryFn: () => api.restaurants.statistics(place.restaurantId!), enabled: !!place.restaurantId });
  const s = stats.data;
  return (
    <section aria-label="Perbandingan rating" className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div className="card p-4">
        <div className="flex items-center justify-between">
          <h2 className="font-extrabold">Rating komunitas</h2>
          <SourceTag source="mam" />
        </div>
        {s && s.reviewCount > 0 ? (
          <>
            <p className="mt-2 flex items-end gap-2">
              <span className="text-display font-extrabold">{formatRating(s.averageOverall)}</span>
              <span className="pb-2 text-small text-text-muted">dari {s.reviewCount} ulasan MAM!</span>
            </p>
            <dl className="mt-2 space-y-1 text-small">
              {(
                [
                  ['Rasa', s.averages.taste],
                  ['Harga', s.averages.price],
                  ['Porsi', s.averages.portion],
                  ['Kebersihan', s.averages.cleanliness],
                  ['Layanan', s.averages.service],
                ] as const
              ).map(([k, v]) => (
                <div key={k} className="flex items-center gap-2">
                  <dt className="w-24 text-text-muted">{k}</dt>
                  <dd className="h-2 flex-1 overflow-hidden rounded-pill bg-surface-muted">
                    <span className="block h-full rounded-pill bg-primary" style={{ width: `${((v ?? 0) / 5) * 100}%` }} />
                  </dd>
                  <span className="w-8 text-right font-semibold">{formatRating(v)}</span>
                </div>
              ))}
            </dl>
            {s.medianPricePaid !== null && (
              <p className="mt-3 text-small">
                Median harga dilaporkan: <strong>{formatIdr(s.medianPricePaid)}</strong> / kunjungan
              </p>
            )}
          </>
        ) : (
          <p className="mt-3 text-small text-text-muted">Belum ada ulasan MAM! untuk tempat ini. Jadilah yang pertama!</p>
        )}
      </div>
      {place.source !== 'GOOGLE' ? (
        <DataSourceCard place={place} />
      ) : (
      <div className="card p-4">
        <div className="flex items-center justify-between">
          <h2 className="font-extrabold">Rating di Google Maps</h2>
          <SourceTag source="google" />
        </div>
        {place.google.rating !== null ? (
          <>
            <p className="mt-2 flex items-end gap-2">
              <span className="text-display font-extrabold">{formatRating(place.google.rating)}</span>
              <span className="pb-2 text-small text-text-muted">dari {place.google.userRatingCount?.toLocaleString('id-ID') ?? 0} ulasan Google</span>
            </p>
            <Stars value={place.google.rating} />
          </>
        ) : (
          <p className="mt-3 text-small text-text-muted">Rating Google tidak tersedia saat ini.</p>
        )}
        <p className="mt-3 text-caption text-text-muted">Rating Google dan rating MAM! dihitung terpisah dan tidak digabungkan.</p>
        <a href={place.google.mapsUri ?? mapsPlaceUrl(place.placeId, place.name)} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-small font-bold text-google underline underline-offset-4">
          Buka di Google Maps ↗
        </a>
      </div>
      )}
    </section>
  );
}

function CommunityReviews({ place }: { place: PlaceDetail }) {
  const [sort, setSort] = useState<'recent' | 'helpful' | 'highest' | 'lowest'>('recent');
  const [page, setPage] = useState(1);
  const q = useQuery({
    queryKey: ['reviews', 'restaurant', place.restaurantId, sort, page],
    queryFn: () => api.restaurants.reviews(place.restaurantId!, { sort, page, pageSize: 10 }),
    enabled: !!place.restaurantId,
  });
  return (
    <section aria-labelledby="community-reviews">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 id="community-reviews" className="flex items-center gap-2 text-h2 font-extrabold">
          Ulasan komunitas <SourceTag source="mam" />
        </h2>
        <label className="text-small">
          <span className="sr-only">Urutkan ulasan</span>
          <select value={sort} onChange={(e) => (setSort(e.target.value as typeof sort), setPage(1))} className="h-9 rounded-md border border-border bg-surface px-2">
            <option value="recent">Terbaru</option>
            <option value="helpful">Paling membantu</option>
            <option value="highest">Rating tertinggi</option>
            <option value="lowest">Rating terendah</option>
          </select>
        </label>
      </div>
      {!place.restaurantId ? (
        <EmptyState title="Belum ada ulasan MAM!" body="Tempat ini belum pernah diulas di MAM!." action={<LinkButton href={`/tempat/${place.placeId}/ulas`}>Tulis ulasan pertama</LinkButton>} />
      ) : q.isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : q.error ? (
        <ErrorState onRetry={() => q.refetch()} />
      ) : !q.data?.items.length ? (
        <EmptyState title="Belum ada ulasan MAM!" body="Bagikan pengalamanmu makan di sini." action={<LinkButton href={`/tempat/${place.placeId}/ulas`}>Tulis ulasan pertama</LinkButton>} />
      ) : (
        <div className="space-y-3">
          {q.data.items.map((r) => (
            <ReviewCard key={r.id} review={r} />
          ))}
          <div className="flex justify-between">
            <Button variant="ghost" size="sm" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
              ← Sebelumnya
            </Button>
            <Button variant="ghost" size="sm" disabled={!q.data.hasMore} onClick={() => setPage((p) => p + 1)}>
              Berikutnya →
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}

function GoogleReviews({ placeId }: { placeId: string }) {
  const q = useQuery({ queryKey: ['external-reviews', placeId], queryFn: () => api.places.externalReviews(placeId), staleTime: 0 });
  return (
    <section aria-labelledby="google-reviews" className="rounded-xl border border-border bg-google-soft/40 p-4">
      <h2 id="google-reviews" className="flex items-center gap-2 text-h3 font-extrabold">
        Cuplikan ulasan dari Google Maps <SourceTag source="google" />
      </h2>
      <p className="mt-1 text-caption text-text-muted">
        Google hanya menyediakan hingga 5 ulasan per tempat. Ini bukan seluruh ulasan Google; baca selengkapnya di Google Maps.
      </p>
      {q.isLoading && <Skeleton className="mt-3 h-24 w-full" />}
      {q.data && !q.data.provider.ok && <p className="mt-3 text-small text-text-muted">{q.data.provider.message ?? 'Ulasan Google sedang tidak tersedia.'}</p>}
      {q.data?.provider.ok && q.data.reviews.length === 0 && <p className="mt-3 text-small text-text-muted">Google tidak menyediakan cuplikan ulasan untuk tempat ini.</p>}
      <ul className="mt-3 space-y-3">
        {q.data?.reviews.map((r, i) => (
          <li key={i} className="rounded-lg bg-surface p-3">
            <div className="flex items-center gap-2">
              <Avatar src={r.author.photoUri ?? null} name={r.author.displayName} size={28} />
              {r.author.uri ? (
                <a href={r.author.uri} target="_blank" rel="noopener noreferrer" className="text-small font-semibold hover:underline">
                  {r.author.displayName}
                </a>
              ) : (
                <span className="text-small font-semibold">{r.author.displayName}</span>
              )}
              <span className="text-caption text-text-muted">· {r.relativePublishTime}</span>
              {r.rating !== null && <span className="ml-auto"><Stars value={r.rating} size={12} /></span>}
            </div>
            {r.text && <p className="mt-2 text-small">{r.text}</p>}
            {r.googleMapsUri && (
              <a href={r.googleMapsUri} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-caption text-google underline">
                Lihat di Google Maps
              </a>
            )}
          </li>
        ))}
      </ul>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-3 text-small font-semibold">
          {q.data?.googleMapsUri && (
            <a href={q.data.googleMapsUri} target="_blank" rel="noopener noreferrer" className="text-google underline underline-offset-4">
              Semua ulasan di Google Maps{q.data.totalOnGoogle ? ` (${q.data.totalOnGoogle.toLocaleString('id-ID')})` : ''} ↗
            </a>
          )}
          {q.data?.writeReviewUri && (
            <a href={q.data.writeReviewUri} target="_blank" rel="noopener noreferrer" className="text-google underline underline-offset-4" title="Ulasan Google ditulis langsung di Google Maps, terpisah dari ulasan MAM!">
              Tulis ulasan di Google Maps ↗
            </a>
          )}
        </div>
        <GoogleMapsAttribution />
      </div>
    </section>
  );
}

/** Shown instead of the Google rating card for OpenStreetMap and community places. */
function DataSourceCard({ place }: { place: PlaceDetail }) {
  const osm = place.source === 'OSM';
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between">
        <h2 className="font-extrabold">Sumber data tempat</h2>
        <SourceTag source={osm ? 'osm' : 'community-place'} />
      </div>
      <p className="mt-3 text-small text-text-muted">
        {osm
          ? 'Nama, lokasi, dan info tempat ini berasal dari OpenStreetMap, peta terbuka yang dibuat para kontributor. Rating Google tidak ditampilkan untuk tempat ini.'
          : 'Tempat ini ditambahkan oleh pengguna MAM! karena belum ada di peta. Info dapat dikoreksi oleh tim MAM!.'}
      </p>
      {place.local?.cuisine.length ? <p className="mt-2 text-caption text-text-muted">Masakan (tag OSM): {place.local.cuisine.join(', ')}</p> : null}
      {place.local?.brand && (
        <div className="mt-3 rounded-lg bg-surface-muted p-3">
          <p className="text-small font-bold">Bagian dari jaringan {place.local.brand.name}</p>
          {place.local.brand.description && <p className="mt-1 text-small text-text-muted">{place.local.brand.description}</p>}
          <div className="mt-1 flex flex-wrap gap-x-3 text-caption">
            {place.local.brand.website && (
              <a href={place.local.brand.website} target="_blank" rel="noopener noreferrer" className="tap font-semibold underline">
                Situs resmi ↗
              </a>
            )}
            {/^Q\d+$/.test(place.local.brand.wikidata ?? '') && (
              <a href={`https://www.wikidata.org/wiki/${place.local.brand.wikidata}`} target="_blank" rel="noopener noreferrer" className="tap underline">
                Wikidata ↗
              </a>
            )}
          </div>
          {place.local.brand.image && place.local.brand.logo && (
            <p className="mt-1">
              <MediaCreditLine credit={place.local.brand.image} label="Foto" />
            </p>
          )}
          <p className="mt-1 text-[11px] text-text-muted">Logo dan nama brand adalah merek dagang pemiliknya; ditampilkan hanya sebagai identitas.</p>
        </div>
      )}
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-small font-bold">
        {osm && place.local?.osmUrl && (
          <a href={place.local.osmUrl} target="_blank" rel="noopener noreferrer" className="tap underline underline-offset-4">
            Lihat / perbaiki di OpenStreetMap ↗
          </a>
        )}
        {!osm && (
          <a href={osmViewUrl(place.location)} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">
            Buka lokasi di peta ↗
          </a>
        )}
      </div>
      {osm && (
        <p className="mt-3 text-caption text-text-muted">
          <a href={OSM_COPYRIGHT_URL} target="_blank" rel="noopener noreferrer" className="underline">
            {OSM_ATTRIBUTION}
          </a>{' '}
          · Lisensi ODbL
        </p>
      )}
    </div>
  );
}

function InfoPanel({ place }: { place: PlaceDetail }) {
  return (
    <section className="card space-y-3 p-4" aria-labelledby="info">
      <h2 id="info" className="flex items-center justify-between font-extrabold">
        Info tempat <SourceTag source={place.source === 'OSM' ? 'osm' : place.source === 'COMMUNITY' ? 'community-place' : 'google'} />
      </h2>
      {place.location.lat !== 0 && <PlacesMap center={place.location} radius={150} places={[place]} className="h-48" />}
      <div className="flex flex-wrap gap-2">
        <LinkButton href={directionsUrlFor(place)} external variant="secondary" className="h-9 text-small">
          🧭 Petunjuk arah
        </LinkButton>
        {place.phone && (
          <LinkButton href={`tel:${place.phone.replace(/\s/g, '')}`} external variant="outline" className="h-9 text-small">
            📞 {place.phone}
          </LinkButton>
        )}
        {place.website && (
          <LinkButton href={place.website} external variant="outline" className="h-9 text-small">
            🌐 Situs
          </LinkButton>
        )}
      </div>
      {place.openingHours && (
        <details className="text-small">
          <summary className="cursor-pointer font-semibold">Jam buka</summary>
          <ul className="mt-2 space-y-0.5 text-text-muted">
            {place.openingHours.map((h) => (
              <li key={h}>{h}</li>
            ))}
          </ul>
        </details>
      )}
      {place.businessStatus && place.businessStatus !== 'OPERATIONAL' && <p className="rounded-md bg-danger-soft px-3 py-2 text-small font-semibold">Menurut Google, tempat ini mungkin sudah tutup.</p>}
    </section>
  );
}

const AVAIL_STYLE: Record<PlatformLinkView['availability'], string> = {
  VERIFIED: 'bg-success-soft text-success',
  UNVERIFIED: 'bg-secondary-soft text-text',
  UNAVAILABLE: 'bg-surface-muted text-text-muted',
  NOT_INTEGRATED: 'bg-surface-muted text-text-muted',
};
const AVAIL_LABEL: Record<PlatformLinkView['availability'], string> = {
  VERIFIED: 'Terverifikasi',
  UNVERIFIED: 'Belum diverifikasi',
  UNAVAILABLE: 'Tidak tersedia',
  NOT_INTEGRATED: 'Data tidak tersedia',
};

function DeliveryPanel({ restaurantId }: { restaurantId: string | null }) {
  const { me } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const [submitFor, setSubmitFor] = useState<PlatformLinkView | null>(null);
  const [url, setUrl] = useState('');
  const q = useQuery({ queryKey: ['platform-links', restaurantId], queryFn: () => api.restaurants.platformLinks(restaurantId!), enabled: !!restaurantId });
  const submit = useMutation({
    mutationFn: () => api.restaurants.submitPlatformLink(restaurantId!, { provider: submitFor!.provider, url }),
    onSuccess: () => {
      toast('success', 'Terima kasih! Tautan akan diverifikasi tim MAM!.');
      setSubmitFor(null);
      setUrl('');
      qc.invalidateQueries({ queryKey: ['platform-links', restaurantId] });
    },
    onError: (e) => toast('error', e instanceof ApiError ? e.message : 'Gagal mengirim tautan.'),
  });
  return (
    <section className="card p-4" aria-labelledby="delivery">
      <h2 id="delivery" className="flex items-center justify-between font-extrabold">
        Pesan-antar <SourceTag source="delivery" />
      </h2>
      <p className="mt-1 text-caption text-text-muted">MAM! tidak menerima pesanan. Tautan di bawah membuka aplikasi penyedia; menu dan harga hanya ada di sana.</p>
      {!restaurantId ? (
        <p className="mt-3 text-small text-text-muted">Belum ada data platform untuk tempat ini.</p>
      ) : q.isLoading ? (
        <Skeleton className="mt-3 h-24 w-full" />
      ) : (
        <ul className="mt-3 space-y-2">
          {q.data?.map((l) => (
            <li key={l.provider} className="rounded-md border border-border p-3">
              <div className="flex items-center justify-between gap-2">
                <strong>{l.providerName}</strong>
                <span className={`rounded-pill px-2 py-0.5 text-caption font-semibold ${AVAIL_STYLE[l.availability]}`}>{AVAIL_LABEL[l.availability]}</span>
              </div>
              <p className="mt-1 text-caption text-text-muted">{l.note}</p>
              {l.lastVerifiedAt && <p className="text-caption text-text-muted">Terakhir diverifikasi: {formatDate(l.lastVerifiedAt)}</p>}
              <div className="mt-2 flex gap-3 text-small font-semibold">
                {l.url && (
                  <a href={l.url} target="_blank" rel="noopener noreferrer nofollow" className="text-primary-dark underline">
                    Buka di {l.providerName} ↗
                  </a>
                )}
                {me && (l.availability === 'NOT_INTEGRATED' || l.source === 'USER_SUBMITTED') && (
                  <button onClick={() => setSubmitFor(l)} className="text-text-muted underline">
                    Kirim tautan resmi
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      <Modal open={!!submitFor} onClose={() => setSubmitFor(null)} title={`Tautan ${submitFor?.providerName ?? ''}`}>
        <p className="text-small text-text-muted">Tempel tautan resmi restoran ini di {submitFor?.providerName}. Tautan akan ditandai &quot;belum diverifikasi&quot; sampai dicek tim MAM!.</p>
        <label className="mt-3 block text-small font-semibold">
          URL (https)
          <input value={url} onChange={(e) => setUrl(e.target.value)} type="url" placeholder="https://…" className="mt-1 h-11 w-full rounded-md border border-border px-3" />
        </label>
        <Button className="mt-4 w-full" onClick={() => submit.mutate()} loading={submit.isPending} disabled={!url.startsWith('https://')}>
          Kirim
        </Button>
      </Modal>
    </section>
  );
}

function Alternatives({ place }: { place: PlaceDetail }) {
  const q = useQuery({
    queryKey: ['alternatives', place.placeId],
    queryFn: () => api.places.nearby({ lat: place.location.lat, lng: place.location.lng, radius: 1000, categories: place.categories.slice(0, 1) }),
    enabled: place.location.lat !== 0,
  });
  const items = q.data?.items.filter((p) => p.placeId !== place.placeId).slice(0, 4) ?? [];
  if (!q.isLoading && !items.length) return null;
  return (
    <section aria-labelledby="alt">
      <h2 id="alt" className="mb-2 font-extrabold">
        Alternatif terdekat
      </h2>
      {q.isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <ul className="space-y-2">
          {items.map((p) => (
            <li key={p.placeId}>
              <PlaceCard place={p} compact />
            </li>
          ))}
        </ul>
      )}
      <Link href="/jelajah" className="tap mt-2 inline-block text-small font-semibold text-primary-dark hover:underline">
        Jelajahi lebih banyak →
      </Link>
    </section>
  );
}
