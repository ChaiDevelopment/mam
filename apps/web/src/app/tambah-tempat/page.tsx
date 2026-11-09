'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '@mam/api-client';
import { CATEGORY_LABELS_ID, CategorySlugs, type CategorySlug, type LatLng, type PlaceSubmissionView } from '@mam/shared-types';
import { createPlaceSchema } from '@mam/validation';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import type { z } from 'zod';
import { useAuth, useChosenLocation, useToast } from '@/components/providers';
import { Button, Chip, EmptyState } from '@/components/ui';
import { api } from '@/lib/api';

// Leaflet touches `window`, so the picker map renders on the client only.
const OsmMap = dynamic(() => import('@/components/osm-map').then((m) => m.OsmMap), { ssr: false, loading: () => <div className="h-72 animate-pulse rounded-lg bg-surface-muted" /> });

type FormInput = z.input<typeof createPlaceSchema>;
type FormValues = z.output<typeof createPlaceSchema>;
const JAKARTA: LatLng = { lat: -6.1754, lng: 106.8272 };
const inputCls = 'mt-1 h-11 w-full rounded-md border border-border bg-surface px-3 outline-none focus:border-primary';

export default function AddPlacePage() {
  const { me, loading } = useAuth();
  const { location } = useChosenLocation();
  const router = useRouter();
  const toast = useToast();
  const [duplicate, setDuplicate] = useState<{ message: string; placeId: string } | null>(null);
  const start = location ?? JAKARTA;
  const qc = useQueryClient();
  const [submitted, setSubmitted] = useState<PlaceSubmissionView | null>(null);
  const mine = useQuery({ queryKey: ['my-submissions'], queryFn: () => api.places.mySubmissions(), enabled: !!me });

  const form = useForm<FormInput, unknown, FormValues>({
    resolver: zodResolver(createPlaceSchema),
    defaultValues: { name: '', lat: undefined as unknown as number, lng: undefined as unknown as number, address: '', city: '', categories: [], phone: '', website: '', openingHours: '' },
  });
  const { errors } = form.formState;
  const lat = form.watch('lat');
  const lng = form.watch('lng');
  const picked = typeof lat === 'number' && typeof lng === 'number' ? { lat, lng } : null;

  const save = useMutation({
    mutationFn: (v: FormValues) => api.places.create(v),
    onSuccess: (p) => {
      void qc.invalidateQueries({ queryKey: ['my-submissions'] });
      if (p.status === 'ACTIVE') {
        toast('success', 'Tempat ditambahkan dan langsung tampil (akun staf).');
        router.push(`/tempat/${p.placeId}`);
        return;
      }
      setSubmitted(p);
      form.reset();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    onError: (e) => {
      if (e instanceof ApiError && e.status === 409) {
        const d = e.body?.details as { placeId?: string } | undefined;
        if (d?.placeId) return setDuplicate({ message: e.message, placeId: d.placeId });
      }
      toast('error', e instanceof ApiError ? e.message : 'Tempat belum bisa disimpan. Coba lagi.');
    },
  });

  const pick = (c: LatLng) => {
    form.setValue('lat', Number(c.lat.toFixed(7)), { shouldValidate: true });
    form.setValue('lng', Number(c.lng.toFixed(7)), { shouldValidate: true });
    setDuplicate(null);
  };

  if (!loading && !me) {
    return (
      <div className="container-page pt-10">
        <EmptyState title="Masuk dulu, yuk" body="Kamu perlu masuk untuk menambahkan tempat makan baru." action={<Link href="/masuk?next=/tambah-tempat" className="font-bold underline">Masuk</Link>} />
      </div>
    );
  }

  return (
    <div className="container-page max-w-2xl space-y-6 pt-6">
      <header>
        <h1 className="text-h1 font-extrabold">Tambah tempat makan</h1>
        <p className="mt-1 text-small text-text-muted">
          Tempat favoritmu belum ada di MAM!? Tambahkan di sini — data diambil dari peta terbuka OpenStreetMap, dan yang belum ada dilengkapi oleh komunitas. Isi hanya info yang kamu yakini benar.
        </p>
      </header>

      {submitted && (
        <div role="status" className="rounded-lg border border-primary bg-primary-soft p-4">
          <p className="font-extrabold">✅ Pengajuan &quot;{submitted.name}&quot; terkirim</p>
          <p className="mt-1 text-small">
            Tempat ini akan tampil di MAM! setelah disetujui moderator. Kalau ditolak, kami kirim alasannya ke email kamu. Status pengajuan bisa dilihat di bawah.
          </p>
          <button type="button" className="mt-2 text-small font-bold underline" onClick={() => setSubmitted(null)}>
            Ajukan tempat lain
          </button>
        </div>
      )}

      <form onSubmit={form.handleSubmit((v) => save.mutate(v))} className={`space-y-5 ${submitted ? 'hidden' : ''}`} noValidate>
        <label className="block text-small font-semibold">
          Nama tempat *
          <input {...form.register('name')} className={inputCls} placeholder="mis. Warung Nasi Bu Tini" aria-invalid={!!errors.name} maxLength={120} />
          {errors.name && <span className="mt-1 block text-caption text-danger">{errors.name.message}</span>}
        </label>

        <fieldset>
          <legend className="text-small font-semibold">Lokasi di peta *</legend>
          <p className="text-caption text-text-muted">Ketuk peta untuk menaruh pin, lalu geser pin sampai tepat di lokasi tempat makan.</p>
          <OsmMap center={picked ?? start} onPick={pick} picked={picked} className="mt-2 h-72" />
          <div className="mt-2 flex flex-wrap items-center gap-2 text-caption text-text-muted">
            {picked ? <span>📍 {picked.lat.toFixed(5)}, {picked.lng.toFixed(5)}</span> : <span>Belum ada titik dipilih.</span>}
            {location && (
              <button type="button" className="font-semibold text-text underline" onClick={() => pick(location)}>
                Pakai lokasiku sekarang
              </button>
            )}
          </div>
          {(errors.lat || errors.lng) && <span className="mt-1 block text-caption text-danger">Pilih titik lokasi di wilayah Indonesia.</span>}
        </fieldset>

        <fieldset>
          <legend className="text-small font-semibold">Kategori * (maks. 3)</legend>
          <Controller
            control={form.control}
            name="categories"
            render={({ field }) => (
              <div className="mt-2 flex flex-wrap gap-2">
                {CategorySlugs.map((slug) => {
                  const selected = (field.value ?? []).includes(slug);
                  return (
                    <Chip
                      key={slug}
                      selected={selected}
                      onClick={() => {
                        const cur = (field.value ?? []) as CategorySlug[];
                        field.onChange(selected ? cur.filter((c) => c !== slug) : cur.length < 3 ? [...cur, slug] : cur);
                      }}
                    >
                      {CATEGORY_LABELS_ID[slug]}
                    </Chip>
                  );
                })}
              </div>
            )}
          />
          {errors.categories && <span className="mt-1 block text-caption text-danger">{errors.categories.message}</span>}
        </fieldset>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block text-small font-semibold sm:col-span-2">
            Alamat
            <input {...form.register('address')} className={inputCls} placeholder="Jl. ... No. ..., Kecamatan" maxLength={300} />
          </label>
          <label className="block text-small font-semibold">
            Kota / kabupaten
            <input {...form.register('city')} className={inputCls} placeholder="Otomatis jika dikosongkan" maxLength={120} />
          </label>
          <label className="block text-small font-semibold">
            Telepon
            <input {...form.register('phone')} inputMode="tel" className={inputCls} placeholder="0812..." maxLength={30} aria-invalid={!!errors.phone} />
            {errors.phone && <span className="mt-1 block text-caption text-danger">{errors.phone.message}</span>}
          </label>
          <label className="block text-small font-semibold">
            Situs / Instagram
            <input {...form.register('website')} inputMode="url" className={inputCls} placeholder="https://..." maxLength={300} aria-invalid={!!errors.website} />
            {errors.website && <span className="mt-1 block text-caption text-danger">{errors.website.message}</span>}
          </label>
          <label className="block text-small font-semibold">
            Jam buka
            <input {...form.register('openingHours')} className={inputCls} placeholder="mis. Setiap hari 08.00–21.00" maxLength={200} />
          </label>
        </div>

        {duplicate && (
          <div role="alert" className="rounded-lg bg-secondary-soft p-4 text-small">
            <p className="font-semibold">{duplicate.message}</p>
            <p className="mt-1">
              Mungkin ini tempat yang sama.{' '}
              <Link href={`/tempat/${duplicate.placeId}`} className="font-bold underline">
                Lihat tempat itu
              </Link>{' '}
              — kalau memang berbeda, geser pin ke lokasi yang tepat atau bedakan namanya.
            </p>
          </div>
        )}

        <Button type="submit" size="lg" className="w-full" loading={save.isPending}>
          Simpan tempat
        </Button>
        <p className="text-center text-caption text-text-muted">Tempat yang ditambahkan dapat ditinjau dan dikoreksi oleh tim moderasi MAM!.</p>
      </form>

      <MySubmissions items={mine.data} loading={mine.isLoading} />
    </div>
  );
}

const STATUS_LABEL: Record<string, { text: string; cls: string }> = {
  PENDING: { text: 'Menunggu moderator', cls: 'bg-secondary-soft' },
  ACTIVE: { text: 'Disetujui', cls: 'bg-success-soft text-success' },
  REJECTED: { text: 'Ditolak', cls: 'bg-danger-soft' },
};

function MySubmissions({ items, loading }: { items?: PlaceSubmissionView[]; loading: boolean }) {
  if (loading || !items?.length) return null;
  return (
    <section aria-labelledby="my-subs" className="space-y-3 pb-8">
      <h2 id="my-subs" className="text-h3 font-extrabold">
        Pengajuan tempatku
      </h2>
      <ul className="space-y-2">
        {items.map((s) => {
          const st = STATUS_LABEL[s.status] ?? { text: s.status, cls: 'bg-surface-muted' };
          return (
            <li key={s.id} className="card p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  {s.status === 'ACTIVE' ? (
                    <a href={`/tempat/${s.placeId}`} className="font-bold underline">
                      {s.name}
                    </a>
                  ) : (
                    <p className="font-bold">{s.name}</p>
                  )}
                  <p className="truncate text-caption text-text-muted">{[s.address, s.city].filter(Boolean).join(' · ') || `${s.location.lat.toFixed(5)}, ${s.location.lng.toFixed(5)}`}</p>
                </div>
                <span className={`shrink-0 rounded-pill px-2 py-0.5 text-caption font-semibold ${st.cls}`}>{st.text}</span>
              </div>
              {s.status === 'REJECTED' && s.moderationNote && <p className="mt-2 rounded-md bg-surface-muted p-2 text-small">Alasan: {s.moderationNote}</p>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
