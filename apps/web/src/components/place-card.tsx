'use client';

import { formatDistance, formatIdr, formatRating } from '@mam/api-client';
import { CATEGORY_LABELS_ID, OSM_ATTRIBUTION, OSM_COPYRIGHT_URL, type GooglePhotoRef, type MediaCredit, type PlaceSummary } from '@mam/shared-types';
import Link from 'next/link';
import { api } from '@/lib/api';
import { BowlIllustration } from './illustrations';

/** Text attribution for Google Maps content shown outside a Google map (per Google Maps Platform policies). */
export function GoogleMapsAttribution({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 text-caption text-text-muted ${className}`} translate="no">
      <span style={{ fontFamily: 'Roboto, Arial, sans-serif' }} className="font-medium text-google">
        Google Maps
      </span>
    </span>
  );
}

export function GooglePhoto({ photo, alt, className = '', maxWidth = 480, showAttribution = true }: { photo: GooglePhotoRef; alt: string; className?: string; maxWidth?: number; showAttribution?: boolean }) {
  const author = photo.authorAttributions[0];
  return (
    <figure className={`relative overflow-hidden ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={api.places.photoUrl(photo.name, maxWidth)} alt={alt} loading="lazy" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
      {showAttribution && author && (
        <figcaption className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/60 to-transparent px-2 pb-1 pt-4 text-[10px] text-white">
          Foto: {author.uri ? <a href={author.uri} target="_blank" rel="noopener noreferrer" className="underline" onClick={(e) => e.stopPropagation()}>{author.displayName}</a> : author.displayName}
        </figcaption>
      )}
    </figure>
  );
}

/** License label used for files supplied with the brand owner's permission. */
export const OWNER_LICENSE = 'Izin pemilik merek';

/** Commons sometimes repeats the author ("Unknown authorUnknown author"); show it once, in Indonesian when unknown. */
export function cleanAuthor(a: string): string {
  const t = a.replace(/\s+/g, ' ').trim();
  const half = t.length / 2;
  const once = t.length % 2 === 0 && t.slice(0, half) === t.slice(half) ? t.slice(0, half) : t;
  return /^unknown author$|^tidak diketahui$/i.test(once.trim()) ? 'pembuat tidak diketahui' : once.trim();
}

/** "Logo: Author · CC BY-SA 4.0 · Wikimedia Commons" — required next to freely licensed Commons files. */
export function MediaCreditLine({ credit, label, className = '' }: { credit: MediaCredit; label: string; className?: string }) {
  return (
    <span className={`text-[11px] text-text-muted ${className}`}>
      {label}: {cleanAuthor(credit.author)}
      {credit.license === OWNER_LICENSE ? ' · digunakan dengan izin pemilik merek' : ' · '}
      {credit.license !== OWNER_LICENSE && 
(credit.licenseUrl ? (
        <a href={credit.licenseUrl} target="_blank" rel="noopener noreferrer" className="underline">
          {credit.license}
        </a>
      ) : (
        credit.license
      ))}
      {credit.sourceUrl && (
        <>
          {' · '}
          <a href={credit.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline">
            {/wikimedia\.org/.test(credit.sourceUrl) ? 'Wikimedia Commons' : 'situs resmi'}
          </a>
        </>
      )}
    </span>
  );
}

/** Brand logo (contain) or photo (cover) from Wikimedia Commons; falls back to the bowl illustration. */
export function BrandThumb({ place, className = '' }: { place: PlaceSummary; className?: string }) {
  const brand = place.local?.brand;
  const logo = brand?.logo;
  const image = brand?.image;
  if (logo) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={logo.thumbUrl} alt={`Logo ${brand!.name}`} loading="lazy" referrerPolicy="no-referrer" className={`h-full w-full bg-white object-contain p-2 ${className}`} />
    );
  }
  if (image) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={image.thumbUrl} alt={`Foto ${brand!.name}`} loading="lazy" referrerPolicy="no-referrer" className={`h-full w-full object-cover ${className}`} />
    );
  }
  return <BowlIllustration className={`h-full w-full p-2 ${className}`} />;
}

/** Required attribution wherever OpenStreetMap data is shown (ODbL). */
export function OsmAttribution({ className = '' }: { className?: string }) {
  return (
    <a href={OSM_COPYRIGHT_URL} target="_blank" rel="noopener noreferrer" className={`text-caption text-text-muted underline-offset-2 hover:underline ${className}`}>
      {OSM_ATTRIBUTION}
    </a>
  );
}

/** Labels where a place's data comes from (OpenStreetMap or added by the MAM! community). */
export function SourceBadge({ source }: { source: PlaceSummary['source'] }) {
  if (source === 'OSM') {
    return (
      <span className="rounded bg-surface-muted px-1.5 text-text-muted" title="Data tempat dari OpenStreetMap (© OpenStreetMap contributors)">
        OSM
      </span>
    );
  }
  if (source === 'COMMUNITY') {
    return (
      <span className="rounded bg-secondary/40 px-1.5 text-text" title="Tempat ini ditambahkan oleh pengguna MAM!">
        Ditambah komunitas
      </span>
    );
  }
  return null;
}

export function PriceInfo({ place }: { place: Pick<PlaceSummary, 'community' | 'google'> }) {
  if (place.community?.medianPricePaid) {
    return (
      <span title="Median harga yang dilaporkan pengguna MAM!">
        ~{formatIdr(place.community.medianPricePaid)} <span className="text-text-muted">(laporan MAM!)</span>
      </span>
    );
  }
  const r = place.google.priceRange;
  if (r && (r.min || r.max)) {
    return (
      <span title="Rentang harga per orang dari Google Maps">
        {r.min ? formatIdr(r.min) : ''}
        {r.min && r.max ? '–' : ''}
        {r.max ? formatIdr(r.max) : ''} <span className="text-text-muted">(Google)</span>
      </span>
    );
  }
  return null;
}

export function PlaceCard({ place, compact = false }: { place: PlaceSummary; compact?: boolean }) {
  const cat = place.categories[0];
  return (
    <Link href={`/tempat/${place.placeId}`} className="card group flex gap-3 p-3 transition-shadow hover:shadow-raised focus-visible:shadow-raised">
      <div className={`relative shrink-0 overflow-hidden rounded-md bg-surface-muted ${compact ? 'h-16 w-16' : 'h-24 w-24'}`}>
        {place.photo ? (
          <GooglePhoto photo={place.photo} alt={`Foto ${place.name}`} className="h-full w-full" maxWidth={240} showAttribution={false} />
        ) : (
          <BrandThumb place={place} />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="truncate text-body font-bold group-hover:underline">{place.name}</h3>
        <p className="truncate text-caption text-text-muted">
          {[place.distanceMeters !== null ? formatDistance(place.distanceMeters) : null, cat ? CATEGORY_LABELS_ID[cat] : null, place.address ?? place.local?.city].filter(Boolean).join(' · ')}
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-caption">
          <span className="inline-flex items-center gap-1" title="Rating komunitas MAM!">
            <span className="rounded bg-primary-soft px-1.5 font-bold">MAM!</span>
            {place.community?.averageOverall ? (
              <>
                <strong>{formatRating(place.community.averageOverall)}</strong>
                <span className="text-text-muted">({place.community.reviewCount})</span>
              </>
            ) : (
              <span className="text-text-muted">belum ada ulasan</span>
            )}
          </span>
          {place.local?.brand && !place.name.toLowerCase().includes(place.local.brand.name.toLowerCase()) && (
            <span className="rounded bg-primary-soft px-1.5 font-semibold" title="Jaringan/brand">
              {place.local.brand.name}
            </span>
          )}
          {place.source !== 'GOOGLE' && <SourceBadge source={place.source} />}
          {place.google.rating !== null && (
            <span className="inline-flex items-center gap-1" title="Rating Google Maps">
              <span className="rounded bg-google-soft px-1.5 font-bold text-google">Google</span>
              <strong>{formatRating(place.google.rating)}</strong>
              <span className="text-text-muted">({place.google.userRatingCount ?? 0})</span>
            </span>
          )}
        </div>
        {!compact && (
          <div className="mt-1 flex flex-wrap items-center gap-x-3 text-caption">
            <PriceInfo place={place} />
            {place.openNow !== null && <span className={place.openNow ? 'font-semibold text-success' : 'text-text-muted'}>{place.openNow ? 'Buka sekarang' : 'Tutup'}</span>}
          </div>
        )}
      </div>
    </Link>
  );
}
