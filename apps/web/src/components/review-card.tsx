'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiError, formatDate, formatIdr, formatRating } from '@mam/api-client';
import { ReportReasons, type ReactionType, type ReportReason, type ReviewView } from '@mam/shared-types';
import Link from 'next/link';
import { useState } from 'react';
import { api } from '@/lib/api';
import { useAuth, useToast } from './providers';
import { Avatar, Button, Modal, Stars } from './ui';

const VISIT_LABEL = { DINE_IN: 'Makan di tempat', TAKEAWAY: 'Bawa pulang', DELIVERY: 'Pesan-antar' } as const;
const REACTIONS: { type: ReactionType; emoji: string; label: string }[] = [
  { type: 'HELPFUL', emoji: '👍', label: 'Membantu' },
  { type: 'YUMMY', emoji: '🤤', label: 'Bikin lapar' },
  { type: 'FUNNY', emoji: '😂', label: 'Lucu' },
];
const REPORT_LABELS: Record<ReportReason, string> = {
  SPAM: 'Spam / promosi',
  OFFENSIVE: 'Kasar atau menyinggung',
  FAKE_REVIEW: 'Ulasan palsu',
  IRRELEVANT: 'Tidak relevan',
  PRIVACY: 'Melanggar privasi',
  OTHER: 'Lainnya',
};
const STATUS_LABEL: Partial<Record<ReviewView['status'], string>> = {
  PENDING: 'Menunggu moderasi',
  HIDDEN: 'Disembunyikan moderator',
  REJECTED: 'Ditolak moderator',
};

export function ReviewCard({ review, showRestaurant = false }: { review: ReviewView; showRestaurant?: boolean }) {
  const { me } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const [state, setState] = useState({ counts: review.reactions, mine: review.myReactions });
  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState<ReportReason>('SPAM');
  const [details, setDetails] = useState('');
  const own = me?.userId === review.author.userId;

  // Optimistic update with rollback on failure.
  const react = useMutation({
    mutationFn: ({ type, on }: { type: ReactionType; on: boolean }) => (on ? api.reviews.react(review.id, type) : api.reviews.unreact(review.id, type)),
    onMutate: ({ type, on }) => {
      const prev = state;
      setState((s) => ({
        counts: { ...s.counts, [type]: Math.max(0, s.counts[type] + (on ? 1 : -1)) },
        mine: on ? [...s.mine, type] : s.mine.filter((t) => t !== type),
      }));
      return { prev };
    },
    onError: (e, _v, ctx) => {
      if (ctx) setState(ctx.prev);
      toast('error', e instanceof ApiError ? e.message : 'Gagal menyimpan reaksi.');
    },
    onSuccess: (r) => setState({ counts: { HELPFUL: r.HELPFUL, YUMMY: r.YUMMY, FUNNY: r.FUNNY }, mine: r.mine }),
  });

  const report = useMutation({
    mutationFn: () => api.reviews.report(review.id, reason, details || undefined),
    onSuccess: () => {
      setReporting(false);
      toast('success', 'Terima kasih! Laporanmu akan ditinjau moderator.');
      qc.invalidateQueries({ queryKey: ['reviews'] });
    },
    onError: (e) => toast('error', e instanceof ApiError ? e.message : 'Gagal mengirim laporan.'),
  });

  return (
    <article className="card p-4" aria-label={`Ulasan oleh ${review.author.displayName}`}>
      <header className="flex items-start gap-3">
        <Link href={`/u/${review.author.username}`}>
          <Avatar src={review.author.avatarUrl} name={review.author.displayName} size={40} />
        </Link>
        <div className="min-w-0 flex-1">
          <Link href={`/u/${review.author.username}`} className="font-bold hover:underline">
            {review.author.displayName}
          </Link>
          <p className="text-caption text-text-muted">
            {formatDate(review.createdAt)}
            {review.edited && ' · diedit'} · {VISIT_LABEL[review.visitType]}
            {review.visitedAt && ` · berkunjung ${formatDate(review.visitedAt)}`}
          </p>
          {showRestaurant && review.placeKey && (
            <Link href={`/tempat/${review.placeKey}`} className="mt-0.5 block truncate text-small font-semibold text-primary-dark hover:underline">
              📍 {review.restaurantName ?? 'Lihat tempat'}
            </Link>
          )}
        </div>
        <div className="text-right">
          <p className="text-h3 font-extrabold">{formatRating(review.ratings.overall)}</p>
          <Stars value={review.ratings.overall} size={12} />
        </div>
      </header>

      {STATUS_LABEL[review.status] && <p className="mt-2 inline-block rounded-pill bg-secondary-soft px-2 py-0.5 text-caption font-semibold">{STATUS_LABEL[review.status]}</p>}

      <dl className="mt-3 grid grid-cols-5 gap-1 text-center text-caption">
        {(
          [
            ['Rasa', review.ratings.taste],
            ['Harga', review.ratings.price],
            ['Porsi', review.ratings.portion],
            ['Bersih', review.ratings.cleanliness],
            ['Layanan', review.ratings.service],
          ] as const
        ).map(([k, v]) => (
          <div key={k} className="rounded-md bg-surface-muted py-1">
            <dt className="text-text-muted">{k}</dt>
            <dd className="font-bold">{v}</dd>
          </div>
        ))}
      </dl>

      <p className="mt-3 whitespace-pre-line text-body">{review.text}</p>
      {review.pricePaid !== null && (
        <p className="mt-2 text-small">
          💸 Bayar <strong>{formatIdr(review.pricePaid)}</strong> <span className="text-text-muted">(dilaporkan pengulas)</span>
        </p>
      )}

      {review.photos.length > 0 && (
        <ul className="mt-3 flex gap-2 overflow-x-auto">
          {review.photos.map((p) => (
            <li key={p.id}>
              <a href={p.url} target="_blank" rel="noopener noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.thumbUrl} alt={`Foto makanan dari ${review.author.displayName}`} loading="lazy" className="h-24 w-24 rounded-md object-cover" />
              </a>
            </li>
          ))}
        </ul>
      )}

      <footer className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1">
          {REACTIONS.map((r) => {
            const active = state.mine.includes(r.type);
            return (
              <button
                key={r.type}
                type="button"
                disabled={own || !me || react.isPending}
                onClick={() => react.mutate({ type: r.type, on: !active })}
                aria-pressed={active}
                aria-label={`${r.label} (${state.counts[r.type]})`}
                title={!me ? 'Masuk untuk memberi reaksi' : own ? 'Tidak bisa mereaksi ulasan sendiri' : r.label}
                className={`inline-flex items-center gap-1 rounded-pill border px-2.5 py-1 text-small transition-colors disabled:cursor-default ${active ? 'border-primary bg-primary-soft' : 'border-border hover:bg-surface-muted'}`}
              >
                <span aria-hidden>{r.emoji}</span> {state.counts[r.type]}
              </button>
            );
          })}
        </div>
        <div className="flex gap-2 text-small">
          {own && review.placeKey && (
            <Link href={`/tempat/${review.placeKey}/ulas`} className="font-semibold text-primary-dark hover:underline">
              Edit
            </Link>
          )}
          {me && !own && (
            <button onClick={() => setReporting(true)} className="text-text-muted hover:text-danger">
              Laporkan
            </button>
          )}
        </div>
      </footer>

      <Modal open={reporting} onClose={() => setReporting(false)} title="Laporkan ulasan">
        <fieldset className="space-y-2">
          <legend className="mb-1 text-small text-text-muted">Kenapa ulasan ini perlu ditinjau?</legend>
          {ReportReasons.map((r) => (
            <label key={r} className="flex items-center gap-2">
              <input type="radio" name="reason" value={r} checked={reason === r} onChange={() => setReason(r)} className="accent-primary" />
              {REPORT_LABELS[r]}
            </label>
          ))}
        </fieldset>
        <label className="mt-3 block text-small font-semibold">
          Keterangan (opsional)
          <textarea value={details} onChange={(e) => setDetails(e.target.value)} maxLength={1000} rows={3} className="mt-1 w-full rounded-md border border-border bg-surface p-2" />
        </label>
        <Button className="mt-4 w-full" onClick={() => report.mutate()} loading={report.isPending}>
          Kirim laporan
        </Button>
      </Modal>
    </article>
  );
}
