'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, formatRating } from '@mam/api-client';
import { CATEGORY_LABELS_ID, CategorySlugs, DeliveryProviders, type CategorySlug, type RestaurantView } from '@mam/shared-types';
import { useState } from 'react';
import { hasRole, useMe, useToast } from '@/components/shell';
import { Button, Card, Dialog, Empty, ErrorBox, Loading, PageHeader, Pager, ReasonField, StatusPill } from '@/components/ui';
import { api } from '@/lib/api';

type Row = RestaurantView & { externalRefs: { provider: string; externalPlaceId: string }[] };

export default function RestaurantsPage() {
  const me = useMe();
  const [tab, setTab] = useState<'list' | 'dups'>('list');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [edit, setEdit] = useState<Row | null>(null);
  const [merge, setMerge] = useState<{ source: RestaurantView; target: RestaurantView } | null>(null);
  const list = useQuery({ queryKey: ['restaurants', search, page], queryFn: () => api.admin.restaurants({ q: search || undefined, page, pageSize: 25 }), enabled: tab === 'list' });
  const dups = useQuery({ queryKey: ['duplicates'], queryFn: api.admin.duplicates, enabled: tab === 'dups' });
  const isAdmin = hasRole(me, 'ADMIN');
  return (
    <>
      <PageHeader
        title="Referensi restoran"
        subtitle="Semua tempat di MAM!: data OpenStreetMap, tambahan komunitas, dan referensi Google (opsional). Cari berdasarkan nama, UUID, ID OSM (mis. node/123) atau Place ID."
      />
      <div className="mb-4 flex flex-wrap gap-2">
        <Button variant={tab === 'list' ? 'primary' : 'outline'} onClick={() => setTab('list')}>Semua</Button>
        <Button variant={tab === 'dups' ? 'primary' : 'outline'} onClick={() => setTab('dups')}>Kemungkinan duplikat</Button>
        {tab === 'list' && <input aria-label="Cari" placeholder="Nama admin, UUID, atau Place ID" value={search} onChange={(e) => (setSearch(e.target.value), setPage(1))} className="h-9 min-w-[260px] rounded-md border border-border bg-surface px-3 text-small" />}
      </div>
      {tab === 'list' ? (
        list.isLoading ? <Loading /> : list.error ? <ErrorBox error={list.error} onRetry={() => list.refetch()} /> : !list.data?.items.length ? <Empty text="Belum ada restoran direferensikan." /> : (
          <Card className="overflow-x-auto p-0">
            <table className="w-full min-w-[820px] text-small">
              <thead className="bg-surface-muted text-left text-caption text-text-muted">
                <tr><th className="p-3">Restoran</th><th className="p-3">Referensi eksternal</th><th className="p-3">Kategori</th><th className="p-3">Status</th><th className="p-3 text-right">Ulasan / rating MAM!</th><th className="p-3" /></tr>
              </thead>
              <tbody>
                {list.data.items.map((r) => (
                  <tr key={r.id} className="border-t border-border align-top">
                    <td className="p-3"><strong>{r.name ?? <em className="font-normal text-text-muted">nama dari Google (tidak disimpan)</em>}</strong><br /><code className="text-caption text-text-muted">{r.id}</code></td>
                    <td className="p-3 text-caption">{r.externalRefs.map((e) => <div key={e.externalPlaceId}>{e.provider}: <code>{e.externalPlaceId.slice(0, 22)}…</code></div>)}</td>
                    <td className="p-3">{r.categories.map((c) => CATEGORY_LABELS_ID[c]).join(', ') || '—'}</td>
                    <td className="p-3"><StatusPill status={r.status} /></td>
                    <td className="p-3 text-right tabular-nums">{r.stats.reviewCount} / {formatRating(r.stats.averageOverall)}</td>
                    <td className="p-3 text-right">{isAdmin && r.status !== 'MERGED' && <Button variant="outline" onClick={() => setEdit(r)}>Kelola</Button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="px-3 pb-3"><Pager page={page} total={list.data.total} hasMore={list.data.hasMore} onPage={setPage} /></div>
          </Card>
        )
      ) : dups.isLoading ? <Loading /> : dups.error ? <ErrorBox error={dups.error} /> : !dups.data?.length ? <Empty text="Tidak ada referensi berjarak < 30 m satu sama lain." /> : (
        <div className="space-y-3">
          {dups.data.map((d) => (
            <Card key={`${d.a.id}-${d.b.id}`}>
              <p className="text-small font-semibold">{d.reason}</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {[d.a, d.b].map((r, i) => (
                  <div key={r.id} className="rounded-md bg-surface-muted p-3 text-small">
                    <strong>{r.name ?? 'Tanpa nama'}</strong> · {r.stats.reviewCount} ulasan<br /><code className="text-caption">{r.source} · {r.placeKey ?? r.googlePlaceId}</code>
                    {isAdmin && <div className="mt-2"><Button variant="outline" onClick={() => setMerge({ source: r, target: i === 0 ? d.b : d.a })}>Gabungkan ke yang lain</Button></div>}
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}
      {edit && <EditDialog r={edit} onClose={() => setEdit(null)} />}
      {merge && <MergeDialog {...merge} onClose={() => setMerge(null)} />}
    </>
  );
}

function EditDialog({ r, onClose }: { r: Row; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [name, setName] = useState(r.name ?? '');
  const [status, setStatus] = useState<'ACTIVE' | 'CLOSED' | 'HIDDEN'>(r.status === 'CLOSED' || r.status === 'HIDDEN' ? r.status : 'ACTIVE');
  const [cats, setCats] = useState<CategorySlug[]>(r.categories);
  const [reason, setReason] = useState('');
  const [provider, setProvider] = useState<(typeof DeliveryProviders)[number]>('GOFOOD');
  const [url, setUrl] = useState('');
  const links = useQuery({ queryKey: ['links', r.id], queryFn: () => api.restaurants.platformLinks(r.id) });
  const done = (msg: string) => {
    toast('success', msg);
    qc.invalidateQueries({ queryKey: ['restaurants'] });
    qc.invalidateQueries({ queryKey: ['links', r.id] });
  };
  const save = useMutation({
    mutationFn: () => api.admin.updateRestaurant(r.id, { name: name.trim() || null, status, categories: cats, reason }),
    onSuccess: () => (done('Restoran diperbarui.'), onClose()),
    onError: (e) => toast('error', e instanceof ApiError ? e.message : 'Gagal.'),
  });
  const link = useMutation({
    mutationFn: (availability: 'VERIFIED' | 'UNAVAILABLE') => api.admin.setPlatformLink(r.id, { provider, url: availability === 'VERIFIED' ? url : null, availability, reason }),
    onSuccess: () => done('Status platform diverifikasi.'),
    onError: (e) => toast('error', e instanceof ApiError ? e.message : 'Gagal.'),
  });
  const ok = reason.trim().length >= 5;
  return (
    <Dialog open title="Kelola restoran" onClose={onClose}>
      <ReasonField value={reason} onChange={setReason} />
      <label className="mt-3 block text-small font-semibold">Nama (opsional, sumber: ADMIN)<input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} className="mt-1 h-9 w-full rounded-md border border-border px-2" /></label>
      <label className="mt-3 block text-small font-semibold">Status
        <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className="mt-1 h-9 w-full rounded-md border border-border bg-surface px-2"><option>ACTIVE</option><option>CLOSED</option><option>HIDDEN</option></select>
      </label>
      <fieldset className="mt-3"><legend className="text-small font-semibold">Kategori (maks 5)</legend>
        <div className="mt-1 flex flex-wrap gap-1">{CategorySlugs.map((c) => (
          <label key={c} className="flex items-center gap-1 rounded-pill border border-border px-2 py-0.5 text-caption">
            <input type="checkbox" checked={cats.includes(c)} onChange={() => setCats((cs) => (cs.includes(c) ? cs.filter((x) => x !== c) : cs.length < 5 ? [...cs, c] : cs))} />{CATEGORY_LABELS_ID[c]}
          </label>))}</div>
      </fieldset>
      <Button className="mt-4" disabled={!ok} loading={save.isPending} onClick={() => save.mutate()}>Simpan</Button>

      <div className="mt-6 border-t border-border pt-4">
        <h3 className="font-bold">Platform pesan-antar</h3>
        <p className="text-caption text-text-muted">Verifikasi manual: buka aplikasi penyedia, pastikan restorannya sama, lalu simpan tautan resminya.</p>
        <ul className="mt-2 space-y-1 text-caption">{links.data?.map((l) => <li key={l.provider}><strong>{l.providerName}</strong>: {l.availability} {l.url && <a href={l.url} target="_blank" rel="noopener noreferrer" className="underline">{l.url}</a>}</li>)}</ul>
        <div className="mt-2 flex flex-wrap gap-2">
          <select aria-label="Penyedia" value={provider} onChange={(e) => setProvider(e.target.value as typeof provider)} className="h-9 rounded-md border border-border bg-surface px-2 text-small">{DeliveryProviders.map((p) => <option key={p}>{p}</option>)}</select>
          <input aria-label="URL resmi" placeholder="https://…" value={url} onChange={(e) => setUrl(e.target.value)} className="h-9 flex-1 rounded-md border border-border px-2 text-small" />
        </div>
        <div className="mt-2 flex gap-2">
          <Button disabled={!ok || !url.startsWith('https://')} loading={link.isPending} onClick={() => link.mutate('VERIFIED')}>Tandai terverifikasi</Button>
          <Button variant="outline" disabled={!ok} onClick={() => link.mutate('UNAVAILABLE')}>Tidak tersedia di platform</Button>
        </div>
      </div>
    </Dialog>
  );
}

function MergeDialog({ source, target, onClose }: { source: RestaurantView; target: RestaurantView; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [reason, setReason] = useState('');
  const m = useMutation({
    mutationFn: () => api.admin.mergeRestaurant(source.id, { targetRestaurantId: target.id, reason }),
    onSuccess: () => {
      toast('success', 'Restoran digabungkan.');
      qc.invalidateQueries({ queryKey: ['duplicates'] });
      qc.invalidateQueries({ queryKey: ['restaurants'] });
      onClose();
    },
    onError: (e) => toast('error', e instanceof ApiError ? e.message : 'Gagal.'),
  });
  return (
    <Dialog open title="Gabungkan referensi" onClose={onClose}>
      <p className="text-small">Semua ulasan, favorit, item koleksi, Place ID, dan tautan platform dari <strong>{source.name ?? source.id.slice(0, 8)}</strong> dipindahkan ke <strong>{target.name ?? target.id.slice(0, 8)}</strong>. Jika satu pengguna mengulas keduanya, ulasan di restoran tujuan dipertahankan dan yang lain dipensiunkan (tercatat di audit). Tindakan ini tidak dapat dibatalkan.</p>
      <div className="mt-3"><ReasonField value={reason} onChange={setReason} /></div>
      <Button variant="danger" className="mt-4" disabled={reason.trim().length < 5} loading={m.isPending} onClick={() => m.mutate()}>Gabungkan</Button>
    </Dialog>
  );
}
