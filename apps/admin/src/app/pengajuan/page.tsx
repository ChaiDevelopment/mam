'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, formatDate } from '@mam/api-client';
import { CATEGORY_LABELS_ID, type PlaceSubmissionView } from '@mam/shared-types';
import { useState } from 'react';
import { useToast } from '@/components/shell';
import { Button, Card, Dialog, Empty, ErrorBox, Loading, PageHeader, Pager, ReasonField, StatusPill } from '@/components/ui';
import { api } from '@/lib/api';

const STATUSES = [
  { value: 'PENDING', label: 'Menunggu' },
  { value: 'ACTIVE', label: 'Disetujui' },
  { value: 'REJECTED', label: 'Ditolak' },
] as const;

/** Quick rejection reasons; the moderator can edit the text before sending (it is e-mailed to the submitter). */
const REASONS = [
  'Titik lokasi tidak tepat. Geser pin ke lokasi tempat makan yang sebenarnya.',
  'Tempat ini sudah ada di MAM!. Silakan cari dan ulas tempat yang sudah ada.',
  'Nama tempat tidak jelas atau bukan nama usaha kuliner.',
  'Bukan tempat makan/minum (MAM! khusus kuliner).',
  'Informasi tidak dapat diverifikasi.',
];

export default function PlaceSubmissionsPage() {
  const [status, setStatus] = useState<(typeof STATUSES)[number]['value']>('PENDING');
  const [page, setPage] = useState(1);
  const [rejecting, setRejecting] = useState<PlaceSubmissionView | null>(null);
  const q = useQuery({ queryKey: ['place-submissions', status, page], queryFn: () => api.admin.placeSubmissions({ status, page, pageSize: 20 }) });
  return (
    <>
      <PageHeader
        title="Pengajuan tempat"
        subtitle="Tempat yang ditambahkan pengguna. Periksa nama, kategori, dan titik lokasi sebelum menyetujui. Penolakan wajib beralasan dan dikirim ke email pengaju."
      />
      <div className="mb-4 flex flex-wrap gap-2">
        {STATUSES.map((s) => (
          <Button key={s.value} variant={status === s.value ? 'primary' : 'outline'} onClick={() => (setStatus(s.value), setPage(1))}>
            {s.label}
          </Button>
        ))}
      </div>
      {q.isLoading ? (
        <Loading />
      ) : q.error ? (
        <ErrorBox error={q.error} onRetry={() => q.refetch()} />
      ) : !q.data?.items.length ? (
        <Empty text={status === 'PENDING' ? 'Tidak ada pengajuan yang menunggu. 🎉' : 'Belum ada data.'} />
      ) : (
        <div className="space-y-3">
          {q.data.items.map((s) => (
            <SubmissionCard key={s.id} s={s} onReject={() => setRejecting(s)} />
          ))}
          <Pager page={page} total={q.data.total} hasMore={q.data.hasMore} onPage={setPage} />
        </div>
      )}
      {rejecting && <RejectDialog s={rejecting} onClose={() => setRejecting(null)} />}
    </>
  );
}

function SubmissionCard({ s, onReject }: { s: PlaceSubmissionView; onReject: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const approve = useMutation({
    mutationFn: () => api.admin.decidePlace(s.id, { action: 'APPROVE' }),
    onSuccess: (r) => {
      toast('success', `"${s.name}" disetujui${r.emailed === 'smtp' ? ' — email terkirim ke pengaju' : r.emailed === 'outbox' ? ' — email disimpan di outbox (SMTP belum diatur)' : ''}.`);
      void qc.invalidateQueries({ queryKey: ['place-submissions'] });
      void qc.invalidateQueries({ queryKey: ['overview'] });
    },
    onError: (e) => toast('error', e instanceof ApiError ? e.message : 'Gagal menyetujui.'),
  });
  const { lat, lng } = s.location;
  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill status={s.status} />
            <strong className="text-body">{s.name}</strong>
            <span className="text-caption text-text-muted">{s.categories.map((c) => CATEGORY_LABELS_ID[c]).join(', ')}</span>
          </div>
          <p className="text-small">{[s.address, s.city].filter(Boolean).join(' · ') || 'Alamat tidak diisi'}</p>
          <p className="text-caption text-text-muted">
            Koordinat {lat.toFixed(6)}, {lng.toFixed(6)} ·{' '}
            <a className="underline" href={`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=19/${lat}/${lng}`} target="_blank" rel="noopener noreferrer">
              OpenStreetMap ↗
            </a>{' '}
            ·{' '}
            <a className="underline" href={`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`} target="_blank" rel="noopener noreferrer">
              Google Maps ↗
            </a>
          </p>
          {(s.phone || s.website || s.openingHours) && (
            <p className="text-caption text-text-muted">{[s.phone && `☎ ${s.phone}`, s.website && `🌐 ${s.website}`, s.openingHours && `🕒 ${s.openingHours}`].filter(Boolean).join(' · ')}</p>
          )}
          <p className="text-caption text-text-muted">
            Diajukan {formatDate(s.createdAt, { dateStyle: 'medium', timeStyle: 'short' })} oleh {s.submittedBy ? `${s.submittedBy.displayName} (@${s.submittedBy.username}, ${s.submittedBy.email})` : 'akun terhapus'}
          </p>
          {!!s.nearby?.length && (
            <div className="rounded-md bg-secondary-soft p-2 text-caption">
              <strong>Mungkin duplikat — tempat lain ≤150 m:</strong>{' '}
              {s.nearby.map((n, i) => (
                <span key={n.placeId}>
                  {i > 0 && ', '}
                  {n.name} ({n.distanceMeters} m, {n.source})
                </span>
              ))}
            </div>
          )}
          {s.status === 'REJECTED' && s.moderationNote && <p className="text-small">Alasan penolakan: {s.moderationNote}</p>}
        </div>
        {s.status === 'PENDING' && (
          <div className="flex shrink-0 gap-2">
            <Button onClick={() => approve.mutate()} loading={approve.isPending}>
              Setujui
            </Button>
            <Button variant="danger" onClick={onReject}>
              Tolak
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}

function RejectDialog({ s, onClose }: { s: PlaceSubmissionView; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [reason, setReason] = useState('');
  const reject = useMutation({
    mutationFn: () => api.admin.decidePlace(s.id, { action: 'REJECT', reason: reason.trim() }),
    onSuccess: (r) => {
      toast('success', r.emailed === 'smtp' ? 'Ditolak. Alasan dikirim ke email pengaju.' : r.emailed === 'outbox' ? 'Ditolak. Email disimpan di outbox (SMTP belum diatur).' : 'Ditolak.');
      void qc.invalidateQueries({ queryKey: ['place-submissions'] });
      void qc.invalidateQueries({ queryKey: ['overview'] });
      onClose();
    },
    onError: (e) => toast('error', e instanceof ApiError ? e.message : 'Gagal menolak.'),
  });
  return (
    <Dialog open title={`Tolak "${s.name}"`} onClose={onClose}>
      <p className="text-small text-text-muted">Alasan akan dikirim ke email pengaju dan tampil di daftar pengajuannya. Gunakan bahasa yang sopan dan jelas.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {REASONS.map((r) => (
          <button key={r} type="button" onClick={() => setReason(r)} className="rounded-pill border border-border px-2 py-1 text-left text-caption hover:bg-surface-muted">
            {r}
          </button>
        ))}
      </div>
      <div className="mt-3">
        <ReasonField value={reason} onChange={setReason} label="Alasan penolakan (wajib, min. 5 karakter)" />
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>
          Batal
        </Button>
        <Button variant="danger" disabled={reason.trim().length < 5} loading={reject.isPending} onClick={() => reject.mutate()}>
          Tolak &amp; kirim email
        </Button>
      </div>
    </Dialog>
  );
}
