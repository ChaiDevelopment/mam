'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, formatDate } from '@mam/api-client';
import { ReportStatuses, type AdminReportRow, type ModerationActionType } from '@mam/shared-types';
import { useState } from 'react';
import { ReviewDetails } from '@/components/review-row';
import { useToast } from '@/components/shell';
import { Button, Card, Dialog, Empty, ErrorBox, Loading, PageHeader, Pager, ReasonField, StatusPill } from '@/components/ui';
import { api } from '@/lib/api';

const REASON_LABEL: Record<string, string> = { SPAM: 'Spam', OFFENSIVE: 'Menyinggung', FAKE_REVIEW: 'Ulasan palsu', IRRELEVANT: 'Tidak relevan', PRIVACY: 'Privasi', OTHER: 'Lainnya' };

export default function ReportsPage() {
  const [status, setStatus] = useState<(typeof ReportStatuses)[number]>('OPEN');
  const [page, setPage] = useState(1);
  const [active, setActive] = useState<AdminReportRow | null>(null);
  const q = useQuery({ queryKey: ['reports', status, page], queryFn: () => api.admin.reports({ status, page, pageSize: 20 }) });
  return (
    <>
      <PageHeader title="Laporan" subtitle="Antrean laporan ulasan dari pengguna. Laporan terlama tampil lebih dulu." />
      <div className="mb-4 flex flex-wrap gap-2">
        {ReportStatuses.map((s) => (
          <Button key={s} variant={status === s ? 'primary' : 'outline'} onClick={() => (setStatus(s), setPage(1))}>{s}</Button>
        ))}
      </div>
      {q.isLoading ? <Loading /> : q.error ? <ErrorBox error={q.error} onRetry={() => q.refetch()} /> : !q.data?.items.length ? <Empty text="Tidak ada laporan di status ini. 🎉" /> : (
        <div className="space-y-3">
          {q.data.items.map((r) => (
            <Card key={r.id}>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-small">
                  <StatusPill status={r.status} />
                  <strong>{REASON_LABEL[r.reason]}</strong>
                  <span className="text-text-muted">dilaporkan {r.reporter.displayName} · {formatDate(r.createdAt, { dateStyle: 'medium', timeStyle: 'short' })}</span>
                </div>
                {r.status === 'OPEN' && <Button onClick={() => setActive(r)}>Tinjau</Button>}
              </div>
              {r.details && <p className="mb-2 text-small">“{r.details}”</p>}
              <ReviewDetails r={r.review} />
              {r.resolutionNote && <p className="mt-2 text-caption text-text-muted">Catatan: {r.resolutionNote}</p>}
            </Card>
          ))}
          <Pager page={page} total={q.data.total} hasMore={q.data.hasMore} onPage={setPage} />
        </div>
      )}
      {active && <ResolveDialog report={active} onClose={() => setActive(null)} />}
    </>
  );
}

function ResolveDialog({ report, onClose }: { report: AdminReportRow; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [action, setAction] = useState<ModerationActionType | ''>('HIDE');
  const [note, setNote] = useState('');
  const resolve = useMutation({
    mutationFn: (status: 'RESOLVED_ACTION_TAKEN' | 'RESOLVED_NO_ACTION' | 'DISMISSED') =>
      api.admin.resolveReport(report.id, { status, note, reviewAction: status === 'RESOLVED_ACTION_TAKEN' ? action || undefined : undefined }),
    onSuccess: () => {
      toast('success', 'Laporan diselesaikan dan dicatat di log audit.');
      qc.invalidateQueries({ queryKey: ['reports'] });
      qc.invalidateQueries({ queryKey: ['overview'] });
      onClose();
    },
    onError: (e) => toast('error', e instanceof ApiError ? e.message : 'Gagal.'),
  });
  const valid = note.trim().length >= 5;
  return (
    <Dialog open title="Tinjau laporan" onClose={onClose}>
      <ReviewDetails r={report.review} />
      <label className="mt-4 block text-small font-semibold">
        Tindakan terhadap ulasan
        <select value={action} onChange={(e) => setAction(e.target.value as ModerationActionType)} className="mt-1 h-9 w-full rounded-md border border-border bg-surface px-2">
          <option value="HIDE">Sembunyikan (HIDE)</option>
          <option value="REJECT">Tolak (REJECT)</option>
          <option value="DELETE">Hapus permanen oleh moderator (DELETE)</option>
        </select>
      </label>
      <div className="mt-3"><ReasonField value={note} onChange={setNote} label="Catatan keputusan (dikirim ke penulis & pelapor, dicatat di audit)" /></div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button disabled={!valid} loading={resolve.isPending} onClick={() => resolve.mutate('RESOLVED_ACTION_TAKEN')}>Ambil tindakan</Button>
        <Button variant="outline" disabled={!valid} onClick={() => resolve.mutate('RESOLVED_NO_ACTION')}>Tidak melanggar</Button>
        <Button variant="ghost" disabled={!valid} onClick={() => resolve.mutate('DISMISSED')}>Abaikan laporan</Button>
      </div>
    </Dialog>
  );
}
