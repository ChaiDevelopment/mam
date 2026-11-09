'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, formatDate } from '@mam/api-client';
import { BUDGET_RANGES_IDR, BudgetBuckets, CATEGORY_LABELS_ID, CategorySlugs, RADIUS_OPTIONS_METERS, type CategorySlug } from '@mam/shared-types';
import { updateMeSchema } from '@mam/validation';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { useAuth, useToast } from '@/components/providers';
import { ReviewCard } from '@/components/review-card';
import { Avatar, Button, Chip, EmptyState, Modal, Skeleton } from '@/components/ui';
import { api } from '@/lib/api';

type Values = z.infer<typeof updateMeSchema>;

export default function ProfilePage() {
  const { me, loading, logout, refresh } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const [tab, setTab] = useState<'reviews' | 'settings'>('reviews');
  const [deleting, setDeleting] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const reviews = useQuery({ queryKey: ['reviews', 'mine', me?.userId], queryFn: () => api.users.reviews(me!.userId), enabled: !!me });
  const history = useQuery({ queryKey: ['search-history'], queryFn: api.users.searchHistory, enabled: !!me && tab === 'settings' });

  const form = useForm<Values>({ resolver: zodResolver(updateMeSchema) });
  const [cats, setCats] = useState<CategorySlug[]>([]);
  useEffect(() => {
    if (!me) return;
    form.reset({
      displayName: me.displayName,
      username: me.username,
      bio: me.bio ?? '',
      preferences: { defaultRadiusMeters: me.preferences.defaultRadiusMeters, budget: me.preferences.budget, saveSearchHistory: me.preferences.saveSearchHistory, notificationsEnabled: me.preferences.notificationsEnabled },
    });
    setCats(me.preferences.preferredCategories);
  }, [me, form]);

  const save = useMutation({
    mutationFn: (v: Values) =>
      api.users.updateMe({
        ...v,
        bio: v.bio || null,
        preferences: { ...v.preferences, defaultRadiusMeters: Number(v.preferences?.defaultRadiusMeters), budget: v.preferences?.budget || null, preferredCategories: cats },
      }),
    onSuccess: async () => {
      toast('success', 'Profil disimpan');
      await refresh();
    },
    onError: (e) => toast('error', e instanceof ApiError ? e.message : 'Gagal menyimpan.'),
  });
  const clearHistory = useMutation({
    mutationFn: api.users.clearSearchHistory,
    onSuccess: () => {
      toast('success', 'Riwayat pencarian dihapus');
      qc.invalidateQueries({ queryKey: ['search-history'] });
    },
  });
  const deleteAccount = useMutation({
    mutationFn: api.users.deleteMe,
    onSuccess: () => {
      qc.clear();
      window.location.href = '/?akun=dihapus';
    },
    onError: (e) => toast('error', e instanceof ApiError ? e.message : 'Gagal menghapus akun.'),
  });

  if (loading || !me)
    return (
      <div className="container-page pt-6">
        <Skeleton className="h-32 w-full" />
      </div>
    );

  return (
    <div className="container-page max-w-3xl space-y-6 pt-6">
      <section className="card flex flex-wrap items-center gap-4 p-5">
        <Avatar src={me.avatarUrl} name={me.displayName} size={72} />
        <div className="min-w-0 flex-1">
          <h1 className="text-h1 font-extrabold">{me.displayName}</h1>
          <p className="text-small text-text-muted">
            @{me.username} · bergabung {formatDate(me.joinedAt, { month: 'long', year: 'numeric' })}
            {me.role !== 'USER' && ` · ${me.role}`}
          </p>
          {me.bio && <p className="mt-1 text-small">{me.bio}</p>}
          <p className="mt-2 text-small">
            <strong>{me.stats.reviewCount}</strong> ulasan · <strong>{me.stats.photoCount}</strong> foto · <strong>{me.stats.helpfulReceived}</strong> 👍 diterima
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/favorit" className="rounded-pill bg-surface-muted px-3 py-1.5 text-small font-semibold">❤️ Favorit</Link>
          <Link href="/koleksi" className="rounded-pill bg-surface-muted px-3 py-1.5 text-small font-semibold">📚 Koleksi</Link>
          <Link href="/notifikasi" className="rounded-pill bg-surface-muted px-3 py-1.5 text-small font-semibold">🔔 Notifikasi</Link>
        </div>
      </section>

      {me.badges.length > 0 && (
        <section aria-labelledby="badges">
          <h2 id="badges" className="mb-2 font-extrabold">Lencana</h2>
          <ul className="flex flex-wrap gap-2">
            {me.badges.map((b) => (
              <li key={b.code} title={b.description} className="rounded-pill bg-secondary-soft px-3 py-1.5 text-small font-semibold">
                🏅 {b.name}
              </li>
            ))}
          </ul>
        </section>
      )}

      <div role="tablist" className="flex gap-2">
        <Chip selected={tab === 'reviews'} onClick={() => setTab('reviews')}>Ulasanku</Chip>
        <Chip selected={tab === 'settings'} onClick={() => setTab('settings')}>Pengaturan & privasi</Chip>
      </div>

      {tab === 'reviews' ? (
        <section className="space-y-3">
          {reviews.isLoading && <Skeleton className="h-40 w-full" />}
          {reviews.data && !reviews.data.items.length && <EmptyState title="Belum ada ulasan" body="Kunjungi tempat makan lalu bagikan pengalamanmu." />}
          {reviews.data?.items.map((r) => <ReviewCard key={r.id} review={r} showRestaurant />)}
        </section>
      ) : (
        <section className="space-y-6">
          <form onSubmit={form.handleSubmit((v) => save.mutate(v))} className="card space-y-4 p-5" noValidate>
            <h2 className="font-extrabold">Profil</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="text-small font-semibold">
                Nama tampilan
                <input {...form.register('displayName')} className="mt-1 h-11 w-full rounded-md border border-border px-3" />
              </label>
              <label className="text-small font-semibold">
                Username
                <input {...form.register('username')} className="mt-1 h-11 w-full rounded-md border border-border px-3" />
                {form.formState.errors.username && <span className="text-caption text-danger">{form.formState.errors.username.message}</span>}
              </label>
            </div>
            <label className="block text-small font-semibold">
              Bio
              <textarea {...form.register('bio')} maxLength={280} rows={2} className="mt-1 w-full rounded-md border border-border p-3" />
            </label>
            <h2 className="pt-2 font-extrabold">Preferensi</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="text-small font-semibold">
                Radius default
                <select {...form.register('preferences.defaultRadiusMeters', { valueAsNumber: true })} className="mt-1 h-11 w-full rounded-md border border-border px-3">
                  {RADIUS_OPTIONS_METERS.map((r) => <option key={r} value={r}>{r / 1000} km</option>)}
                </select>
              </label>
              <label className="text-small font-semibold">
                Budget favorit
                <select {...form.register('preferences.budget')} className="mt-1 h-11 w-full rounded-md border border-border px-3">
                  <option value="">Tidak ada</option>
                  {BudgetBuckets.map((b) => <option key={b} value={b}>{BUDGET_RANGES_IDR[b].label}</option>)}
                </select>
              </label>
            </div>
            <div>
              <p className="text-small font-semibold">Kategori favorit</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {CategorySlugs.map((c) => (
                  <Chip key={c} selected={cats.includes(c)} onClick={() => setCats((cs) => (cs.includes(c) ? cs.filter((x) => x !== c) : [...cs, c]))}>
                    {CATEGORY_LABELS_ID[c]}
                  </Chip>
                ))}
              </div>
            </div>
            <label className="flex items-center gap-2 text-small">
              <input type="checkbox" {...form.register('preferences.saveSearchHistory')} className="accent-primary" /> Simpan riwayat pencarian (teks saja, tanpa lokasi; dihapus otomatis setelah 90 hari)
            </label>
            <label className="flex items-center gap-2 text-small">
              <input type="checkbox" {...form.register('preferences.notificationsEnabled')} className="accent-primary" /> Notifikasi reaksi & lencana
            </label>
            <Button type="submit" loading={save.isPending}>Simpan</Button>
          </form>

          <div className="card space-y-3 p-5">
            <h2 className="font-extrabold">Riwayat pencarian</h2>
            {history.data?.length ? (
              <ul className="flex flex-wrap gap-2">{history.data.map((h) => <li key={h.id} className="rounded-pill bg-surface-muted px-3 py-1 text-small">{h.query}</li>)}</ul>
            ) : (
              <p className="text-small text-text-muted">Kosong.</p>
            )}
            <Button variant="outline" size="sm" onClick={() => clearHistory.mutate()} loading={clearHistory.isPending}>Hapus riwayat</Button>
          </div>

          <div className="card space-y-3 p-5">
            <h2 className="font-extrabold">Akun</h2>
            <p className="text-small text-text-muted">
              Masuk dengan: {[me.hasPassword ? 'email + kata sandi' : null, ...me.linkedProviders].filter(Boolean).join(', ') || '—'} ({me.email})
            </p>
            <ChangePassword hasPassword={me.hasPassword} onDone={refresh} />
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={logout}>Keluar</Button>
              <Button variant="outline" onClick={() => api.request('POST', '/auth/logout-all').then(() => (window.location.href = '/'))}>Keluar dari semua perangkat</Button>
              <Button variant="ghost" className="text-danger" onClick={() => setDeleting(true)}>Hapus akun</Button>
            </div>
          </div>
        </section>
      )}

      <Modal open={deleting} onClose={() => setDeleting(false)} title="Hapus akun permanen">
        <p className="text-small">Profil, favorit, koleksi, riwayat, dan foto kamu akan dihapus. Ulasanmu langsung disembunyikan dan isinya dihapus permanen setelah 30 hari. Tindakan ini tidak dapat dibatalkan.</p>
        <label className="mt-3 block text-small font-semibold">
          Ketik <code className="rounded bg-surface-muted px-1">HAPUS AKUN SAYA</code> untuk konfirmasi
          <input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} className="mt-1 h-11 w-full rounded-md border border-border px-3" />
        </label>
        <Button variant="danger" className="mt-4 w-full" disabled={confirmText !== 'HAPUS AKUN SAYA'} loading={deleteAccount.isPending} onClick={() => deleteAccount.mutate()}>
          Hapus akun saya
        </Button>
      </Modal>
    </div>
  );
}

function ChangePassword({ hasPassword, onDone }: { hasPassword: boolean; onDone: () => Promise<unknown> | void }) {
  const toast = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [error, setError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: () => api.auth.changePassword({ currentPassword: hasPassword ? current : undefined, newPassword: next }),
    onSuccess: async () => {
      setCurrent('');
      setNext('');
      setError(null);
      toast('success', hasPassword ? 'Kata sandi diperbarui.' : 'Kata sandi dibuat. Sekarang kamu bisa masuk dengan email + kata sandi.');
      await onDone();
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Kata sandi belum bisa disimpan.'),
  });
  return (
    <form
      className="space-y-2 rounded-lg bg-surface-muted p-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (next.length < 8) return setError('Kata sandi baru minimal 8 karakter.');
        save.mutate();
      }}
    >
      <p className="text-small font-bold">{hasPassword ? 'Ubah kata sandi' : 'Buat kata sandi'}</p>
      {hasPassword && (
        <label className="block text-caption font-semibold">
          Kata sandi saat ini
          <input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} className="mt-1 h-10 w-full rounded-md border border-border bg-surface px-3" />
        </label>
      )}
      <label className="block text-caption font-semibold">
        Kata sandi baru (minimal 8 karakter)
        <input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} className="mt-1 h-10 w-full rounded-md border border-border bg-surface px-3" />
      </label>
      {error && <p role="alert" className="text-caption font-semibold text-danger">{error}</p>}
      <Button type="submit" size="sm" variant="outline" loading={save.isPending}>
        Simpan kata sandi
      </Button>
    </form>
  );
}
