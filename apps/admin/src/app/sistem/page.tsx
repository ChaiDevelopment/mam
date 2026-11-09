'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, formatDate } from '@mam/api-client';
import { RADIUS_OPTIONS_METERS } from '@mam/shared-types';
import { useEffect, useState } from 'react';
import { hasRole, useMe, useToast } from '@/components/shell';
import { Button, Card, ErrorBox, Loading, PageHeader, ReasonField } from '@/components/ui';
import { api } from '@/lib/api';

const fmtBytes = (b: number) => (b > 1e9 ? `${(b / 1e9).toFixed(2)} GB` : b > 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.round(b / 1e3)} KB`);

export default function SystemPage() {
  const me = useMe();
  const qc = useQueryClient();
  const toast = useToast();
  const integrations = useQuery({ queryKey: ['integrations'], queryFn: api.admin.integrations });
  const storage = useQuery({ queryKey: ['storage'], queryFn: api.admin.storage });
  const config = useQuery({ queryKey: ['config'], queryFn: api.admin.config });
  const check = useMutation({
    mutationFn: api.admin.checkIntegrations,
    onSuccess: (d) => (qc.setQueryData(['integrations'], d), toast('success', 'Pemeriksaan selesai.')),
    onError: (e) => toast('error', e instanceof ApiError ? e.message : 'Gagal.'),
  });
  return (
    <>
      <PageHeader title="Sistem" actions={<Button loading={check.isPending} onClick={() => check.mutate()}>Periksa integrasi sekarang</Button>} />
      <h2 className="mb-2 font-bold">Kesehatan integrasi (24 jam)</h2>
      {integrations.isLoading ? <Loading /> : integrations.error ? <ErrorBox error={integrations.error} /> : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {integrations.data?.map((i) => {
            const state = !i.configured ? { icon: '○', text: 'Tidak dikonfigurasi', cls: 'text-text-muted' } : i.healthy === false ? { icon: '✕', text: 'Bermasalah', cls: 'text-danger' } : i.healthy ? { icon: '✓', text: 'Sehat', cls: 'text-success' } : { icon: '?', text: 'Belum diperiksa', cls: 'text-text-muted' };
            return (
              <Card key={i.provider}>
                <div className="flex items-center justify-between">
                  <strong>{i.provider}</strong>
                  <span className={`text-small font-bold ${state.cls}`}><span aria-hidden>{state.icon}</span> {state.text}</span>
                </div>
                <p className="mt-1 text-caption text-text-muted">{i.note}</p>
                <dl className="mt-2 grid grid-cols-3 gap-1 text-caption">
                  <div><dt className="text-text-muted">Sukses</dt><dd className="font-semibold tabular-nums">{i.successCount24h}</dd></div>
                  <div><dt className="text-text-muted">Error</dt><dd className="font-semibold tabular-nums">{i.errorCount24h}</dd></div>
                  <div><dt className="text-text-muted">Latensi</dt><dd className="font-semibold tabular-nums">{i.avgLatencyMs !== null ? `${i.avgLatencyMs} ms` : '—'}</dd></div>
                </dl>
                {i.lastErrorMessage && <p className="mt-2 break-words text-caption text-danger">Error terakhir {i.lastErrorAt ? formatDate(i.lastErrorAt, { dateStyle: 'short', timeStyle: 'short' }) : ''}: {i.lastErrorMessage}</p>}
              </Card>
            );
          })}
        </div>
      )}

      <div className="mt-8 grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="font-bold">Penyimpanan foto</h2>
          {storage.isLoading ? <Loading /> : storage.error ? <ErrorBox error={storage.error} /> : storage.data && (
            <div className="mt-2 text-small">
              <p>Driver: <strong>{storage.data.driver}</strong></p>
              <p>{storage.data.totalFiles.toLocaleString('id-ID')} file · {fmtBytes(storage.data.totalBytes)}</p>
              <p className={storage.data.orphanedFiles ? 'text-danger' : 'text-text-muted'}>{storage.data.orphanedFiles} unggahan yatim (&gt; 24 jam, dibersihkan otomatis)</p>
              <ul className="mt-2 text-caption text-text-muted">{storage.data.byMime.map((m) => <li key={m.mime}>{m.mime}: {m.files} file · {fmtBytes(m.bytes)}</li>)}</ul>
            </div>
          )}
        </Card>
        <Card>
          <h2 className="font-bold">Konfigurasi platform</h2>
          {config.isLoading ? <Loading /> : config.error ? <ErrorBox error={config.error} /> : config.data && <ConfigForm data={config.data as never} canEdit={hasRole(me, 'SUPER_ADMIN')} />}
        </Card>
      </div>
    </>
  );
}

interface Cfg {
  defaultRadiusMeters: number;
  reviewMinTextLength: number;
  reviewsRequireApproval: boolean;
  maxReviewsPerDay: number;
}

function ConfigForm({ data, canEdit }: { data: { effective: Cfg; defaults: Cfg }; canEdit: boolean }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [v, setV] = useState<Cfg>(data.effective);
  const [reason, setReason] = useState('');
  useEffect(() => setV(data.effective), [data.effective]);
  const save = useMutation({
    mutationFn: () => api.admin.updateConfig({ ...v, reason }),
    onSuccess: () => (toast('success', 'Konfigurasi disimpan.'), qc.invalidateQueries({ queryKey: ['config'] }), setReason('')),
    onError: (e) => toast('error', e instanceof ApiError ? e.message : 'Gagal.'),
  });
  return (
    <fieldset disabled={!canEdit} className="mt-2 space-y-3 text-small">
      {!canEdit && <p className="text-caption text-text-muted">Hanya SUPER_ADMIN yang dapat mengubah konfigurasi.</p>}
      <label className="block font-semibold">Radius default
        <select value={v.defaultRadiusMeters} onChange={(e) => setV({ ...v, defaultRadiusMeters: Number(e.target.value) })} className="mt-1 block h-9 rounded-md border border-border bg-surface px-2">
          {RADIUS_OPTIONS_METERS.map((r) => <option key={r} value={r}>{r / 1000} km</option>)}
        </select>
      </label>
      <label className="block font-semibold">Panjang minimum ulasan (karakter)
        <input type="number" min={1} max={500} value={v.reviewMinTextLength} onChange={(e) => setV({ ...v, reviewMinTextLength: Number(e.target.value) })} className="mt-1 block h-9 w-32 rounded-md border border-border px-2" />
      </label>
      <label className="block font-semibold">Batas ulasan per pengguna per hari
        <input type="number" min={1} max={100} value={v.maxReviewsPerDay} onChange={(e) => setV({ ...v, maxReviewsPerDay: Number(e.target.value) })} className="mt-1 block h-9 w-32 rounded-md border border-border px-2" />
      </label>
      <label className="flex items-center gap-2 font-semibold"><input type="checkbox" checked={v.reviewsRequireApproval} onChange={(e) => setV({ ...v, reviewsRequireApproval: e.target.checked })} /> Semua ulasan baru perlu persetujuan moderator</label>
      {canEdit && (
        <>
          <ReasonField value={reason} onChange={setReason} />
          <Button disabled={reason.trim().length < 5} loading={save.isPending} onClick={() => save.mutate()}>Simpan konfigurasi</Button>
        </>
      )}
    </fieldset>
  );
}
