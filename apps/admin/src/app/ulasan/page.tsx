'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '@mam/api-client';
import type { ModerationActionType, ReviewStatus, ReviewView } from '@mam/shared-types';
import { useEffect, useState } from 'react';
import { ReviewDetails } from '@/components/review-row';
import { useToast } from '@/components/shell';
import { Button, Card, Dialog, Empty, ErrorBox, Loading, PageHeader, Pager, ReasonField } from '@/components/ui';
import { api } from '@/lib/api';

const STATUSES: (ReviewStatus | '')[] = ['', 'PENDING', 'PUBLISHED', 'HIDDEN', 'REJECTED', 'DELETED'];
const ACTIONS_FOR: Record<ReviewStatus, ModerationActionType[]> = {
  PENDING: ['PUBLISH', 'HIDE', 'REJECT', 'DELETE'],
  PUBLISHED: ['HIDE', 'REJECT', 'DELETE'],
  HIDDEN: ['RESTORE', 'REJECT', 'DELETE'],
  REJECTED: ['RESTORE', 'DELETE'],
  DELETED: ['RESTORE'],
};

export default function ReviewModerationPage() {
  const [status, setStatus] = useState<ReviewStatus | ''>('PENDING');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [target, setTarget] = useState<{ r: ReviewView; action: ModerationActionType } | null>(null);
  useEffect(() => {
    const s = new URLSearchParams(window.location.search).get('status');
    if (s && STATUSES.includes(s as ReviewStatus)) setStatus(s as ReviewStatus);
  }, []);
  const q = useQuery({ queryKey: ['admin-reviews', status, search, page], queryFn: () => api.admin.reviews({ status: status || undefined, q: search || undefined, page, pageSize: 20 }) });
  return (
    <>
      <PageHeader title="Moderasi ulasan" subtitle="Ulasan PENDING ditahan otomatis (tautan, nomor telepon, duplikat, lonjakan akun baru) atau karena mode persetujuan aktif." />
      <div className="mb-4 flex flex-wrap gap-2">
        {STATUSES.map((s) => (
          <Button key={s || 'ALL'} variant={status === s ? 'primary' : 'outline'} onClick={() => (setStatus(s), setPage(1))}>{s || 'Semua'}</Button>
        ))}
        <input aria-label="Cari teks ulasan" placeholder="Cari teks…" value={search} onChange={(e) => (setSearch(e.target.value), setPage(1))} className="h-9 rounded-md border border-border bg-surface px-3 text-small" />
      </div>
      {q.isLoading ? <Loading /> : q.error ? <ErrorBox error={q.error} onRetry={() => q.refetch()} /> : !q.data?.items.length ? <Empty text="Tidak ada ulasan." /> : (
        <div className="space-y-3">
          {q.data.items.map((r) => (
            <Card key={r.id}>
              <ReviewDetails r={r} />
              <div className="mt-3 flex flex-wrap gap-2">
                {ACTIONS_FOR[r.status].map((a) => (
                  <Button key={a} variant={a === 'DELETE' ? 'danger' : a === 'PUBLISH' || a === 'RESTORE' ? 'primary' : 'outline'} onClick={() => setTarget({ r, action: a })}>{a}</Button>
                ))}
              </div>
            </Card>
          ))}
          <Pager page={page} total={q.data.total} hasMore={q.data.hasMore} onPage={setPage} />
        </div>
      )}
      {target && <ModerateDialog target={target} onClose={() => setTarget(null)} />}
    </>
  );
}

function ModerateDialog({ target, onClose }: { target: { r: ReviewView; action: ModerationActionType }; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [reason, setReason] = useState('');
  const m = useMutation({
    mutationFn: () => api.admin.moderateReview(target.r.id, { action: target.action, reason }),
    onSuccess: () => {
      toast('success', `Aksi ${target.action} diterapkan.`);
      qc.invalidateQueries({ queryKey: ['admin-reviews'] });
      qc.invalidateQueries({ queryKey: ['overview'] });
      onClose();
    },
    onError: (e) => toast('error', e instanceof ApiError ? e.message : 'Gagal.'),
  });
  return (
    <Dialog open title={`${target.action} ulasan`} onClose={onClose}>
      <p className="mb-3 text-small text-text-muted">Penulis akan menerima notifikasi berisi alasan ini.{target.action === 'DELETE' && ' DELETE oleh moderator mengunci ulasan: penulis tidak dapat membuatnya ulang.'}</p>
      <ReasonField value={reason} onChange={setReason} />
      <Button className="mt-4" disabled={reason.trim().length < 5} loading={m.isPending} onClick={() => m.mutate()}>Terapkan</Button>
    </Dialog>
  );
}
