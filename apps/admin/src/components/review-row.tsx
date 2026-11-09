'use client';

import { formatDate, formatIdr } from '@mam/api-client';
import type { ReviewView } from '@mam/shared-types';
import { StatusPill } from './ui';

export function ReviewDetails({ r }: { r: ReviewView }) {
  return (
    <div className="space-y-2 text-small">
      <div className="flex flex-wrap items-center gap-2">
        <StatusPill status={r.status} />
        <strong>{r.author.displayName}</strong>
        <span className="text-text-muted">@{r.author.username}</span>
        <span className="text-text-muted">· {formatDate(r.createdAt, { dateStyle: 'medium', timeStyle: 'short' })}</span>
        {r.edited && <span className="text-text-muted">· diedit</span>}
      </div>
      <p className="text-text-muted">
        Restoran: {r.restaurantName ?? r.restaurantId.slice(0, 8)} · Rasa {r.ratings.taste} · Harga {r.ratings.price} · Porsi {r.ratings.portion} · Bersih {r.ratings.cleanliness} · Layanan {r.ratings.service} · <strong>Total {r.ratings.overall}</strong>
        {r.pricePaid !== null && ` · ${formatIdr(r.pricePaid)}`}
      </p>
      <p className="whitespace-pre-line rounded-md bg-surface-muted p-3">{r.text || <em className="text-text-muted">(teks dihapus)</em>}</p>
      {r.photos.length > 0 && (
        <div className="flex gap-2">
          {r.photos.map((p) => (
            // eslint-disable-next-line @next/next/no-img-element
            <a key={p.id} href={p.url} target="_blank" rel="noopener noreferrer"><img src={p.thumbUrl} alt="Foto ulasan" className="h-16 w-16 rounded object-cover" /></a>
          ))}
        </div>
      )}
    </div>
  );
}
