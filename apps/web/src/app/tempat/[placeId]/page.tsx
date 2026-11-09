import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import type { PlaceDetail, ProviderStatus } from '@mam/shared-types';
import { API_INTERNAL_URL } from '@/lib/api';
import { PlaceDetailView } from './place-detail-view';

type Params = Promise<{ placeId: string }>;

/**
 * Google Places content must not be cached/stored: fetch with `cache: 'no-store'` so Next.js
 * never writes it to its data cache. The page is rendered dynamically per request.
 */
async function loadPlace(placeId: string): Promise<{ place: PlaceDetail; provider: ProviderStatus } | null | 'error'> {
  if (!/^[A-Za-z0-9_-]{10,300}$/.test(placeId)) return null;
  try {
    const res = await fetch(`${API_INTERNAL_URL}/api/v1/places/${placeId}`, { cache: 'no-store', headers: { Accept: 'application/json' } });
    if (res.status === 404 || res.status === 400) return null;
    if (!res.ok) return 'error';
    return res.json();
  } catch {
    return 'error';
  }
}

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { placeId } = await params;
  const data = await loadPlace(placeId);
  if (!data || data === 'error') return { title: 'Tempat makan' };
  const p = data.place;
  const desc = [
    p.community?.averageOverall ? `Rating komunitas MAM! ${p.community.averageOverall.toFixed(1)} dari ${p.community.reviewCount} ulasan.` : 'Baca dan tulis ulasan di MAM!.',
    p.address,
  ]
    .filter(Boolean)
    .join(' ');
  return { title: p.name, description: desc, openGraph: { title: `${p.name} · MAM!`, description: desc }, alternates: { canonical: `/tempat/${placeId}` } };
}

export default async function PlacePage({ params }: { params: Params }) {
  const { placeId } = await params;
  const data = await loadPlace(placeId);
  if (data === null) notFound();
  const jsonLd =
    data !== 'error' && data.place.community?.averageOverall
      ? {
          '@context': 'https://schema.org',
          '@type': 'Restaurant',
          name: data.place.name,
          address: data.place.address ?? undefined,
          // Only MAM! community ratings are published as structured data — never Google's.
          aggregateRating: { '@type': 'AggregateRating', ratingValue: data.place.community.averageOverall, reviewCount: data.place.community.reviewCount, bestRating: 5, worstRating: 1 },
        }
      : null;
  return (
    <>
      {jsonLd && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />}
      <PlaceDetailView placeId={placeId} initial={data === 'error' ? null : data} />
    </>
  );
}
