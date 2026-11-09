'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, formatRating } from '@mam/api-client';
import type { ReviewPhotoView, ReviewView } from '@mam/shared-types';
import { ALLOWED_IMAGE_MIME, MAX_PHOTOS_PER_REVIEW, MAX_UPLOAD_BYTES, REVIEW_MAX_TEXT_LENGTH, reviewRatingsSchema } from '@mam/validation';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { useToast } from '@/components/providers';
import { Button, ErrorState, Modal, RatingInput, Skeleton } from '@/components/ui';
import { api } from '@/lib/api';

const formSchema = z.object({
  ratings: reviewRatingsSchema,
  text: z.string().trim().min(20, 'Ceritakan sedikit lebih banyak (minimal 20 karakter)').max(REVIEW_MAX_TEXT_LENGTH),
  pricePaid: z.union([z.literal(''), z.coerce.number().int().min(0).max(10_000_000)]).optional(),
  visitType: z.enum(['DINE_IN', 'TAKEAWAY', 'DELIVERY']),
  visitedAt: z.string().optional(),
});
type FormValues = z.infer<typeof formSchema>;

const DIMENSIONS = [
  ['taste', 'Rasa', 'Seberapa enak makanannya?'],
  ['price', 'Harga', 'Sepadan dengan harganya?'],
  ['portion', 'Porsi', 'Cukup mengenyangkan?'],
  ['cleanliness', 'Kebersihan', 'Tempat & peralatan bersih?'],
  ['service', 'Layanan', 'Pelayanannya ramah dan cepat?'],
] as const;

export default function ReviewFormPage() {
  const { placeId } = useParams<{ placeId: string }>();
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();
  const place = useQuery({ queryKey: ['place', placeId], queryFn: () => api.places.detail(placeId) });
  const restaurantId = place.data?.place.restaurantId ?? null;
  const existing = useQuery({ queryKey: ['my-review', restaurantId], queryFn: () => api.restaurants.myReview(restaurantId!), enabled: !!restaurantId });
  const editing: ReviewView | null = existing.data ?? null;
  const [photos, setPhotos] = useState<ReviewPhotoView[]>([]);
  const [uploading, setUploading] = useState(0);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { ratings: { taste: 0, price: 0, portion: 0, cleanliness: 0, service: 0 }, text: '', pricePaid: '', visitType: 'DINE_IN', visitedAt: new Date().toISOString().slice(0, 10) },
  });
  useEffect(() => {
    if (!editing) return;
    form.reset({
      ratings: { taste: editing.ratings.taste, price: editing.ratings.price, portion: editing.ratings.portion, cleanliness: editing.ratings.cleanliness, service: editing.ratings.service },
      text: editing.text,
      pricePaid: editing.pricePaid ?? '',
      visitType: editing.visitType,
      visitedAt: editing.visitedAt ?? '',
    });
    setPhotos(editing.photos);
  }, [editing, form]);

  const ratings = form.watch('ratings');
  const filled = Object.values(ratings).filter((v) => v > 0);
  const overall = filled.length === 5 ? filled.reduce((a, b) => a + b, 0) / 5 : null;

  async function onFiles(files: FileList | null) {
    if (!files) return;
    for (const f of Array.from(files)) {
      if (photos.length + uploading >= MAX_PHOTOS_PER_REVIEW) {
        toast('error', `Maksimal ${MAX_PHOTOS_PER_REVIEW} foto.`);
        break;
      }
      if (!(ALLOWED_IMAGE_MIME as readonly string[]).includes(f.type)) {
        toast('error', `${f.name}: format harus JPEG, PNG, atau WebP.`);
        continue;
      }
      if (f.size > MAX_UPLOAD_BYTES) {
        toast('error', `${f.name}: ukuran maksimal 8 MB.`);
        continue;
      }
      setUploading((n) => n + 1);
      try {
        const p = await api.uploads.reviewPhoto(f, f.name);
        setPhotos((ps) => [...ps, p]);
      } catch (e) {
        toast('error', e instanceof ApiError ? e.message : 'Gagal mengunggah foto.');
      } finally {
        setUploading((n) => n - 1);
      }
    }
  }

  const save = useMutation({
    mutationFn: (v: FormValues) => {
      const body = {
        ratings: v.ratings,
        text: v.text,
        pricePaid: v.pricePaid === '' || v.pricePaid === undefined ? null : Number(v.pricePaid),
        visitType: v.visitType,
        visitedAt: v.visitedAt || null,
        photoIds: photos.map((p) => p.id),
      };
      return editing ? api.reviews.update(editing.id, body) : api.reviews.create({ ...body, ...(restaurantId ? { restaurantId } : { googlePlaceId: placeId }) });
    },
    onSuccess: (r) => {
      toast('success', r.status === 'PENDING' ? 'Ulasan tersimpan dan menunggu moderasi.' : editing ? 'Ulasan diperbarui ✨' : 'Ulasan terbit! Terima kasih 🧡');
      qc.invalidateQueries({ queryKey: ['reviews'] });
      qc.invalidateQueries({ queryKey: ['place', placeId] });
      qc.invalidateQueries({ queryKey: ['stats'] });
      qc.invalidateQueries({ queryKey: ['my-review'] });
      router.push(`/tempat/${placeId}`);
    },
    onError: (e) => {
      if (e instanceof ApiError && e.status === 409) {
        toast('info', 'Kamu sudah mengulas tempat ini — memuat ulasanmu untuk diedit.');
        qc.invalidateQueries({ queryKey: ['place', placeId] });
        qc.invalidateQueries({ queryKey: ['my-review'] });
        return;
      }
      toast('error', e instanceof ApiError ? e.message : 'Gagal menyimpan ulasan.');
    },
  });
  const remove = useMutation({
    mutationFn: () => api.reviews.remove(editing!.id),
    onSuccess: () => {
      toast('success', 'Ulasan dihapus.');
      qc.invalidateQueries({ queryKey: ['reviews'] });
      qc.invalidateQueries({ queryKey: ['my-review'] });
      router.push(`/tempat/${placeId}`);
    },
    onError: (e) => toast('error', e instanceof ApiError ? e.message : 'Gagal menghapus.'),
  });

  if (place.isLoading || (restaurantId && existing.isLoading))
    return (
      <div className="container-page max-w-2xl space-y-3 pt-6" aria-busy="true">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  if (place.error)
    return (
      <div className="container-page max-w-2xl pt-6">
        <ErrorState message={place.error instanceof ApiError ? place.error.message : undefined} onRetry={() => place.refetch()} />
      </div>
    );

  const errors = form.formState.errors;
  return (
    <div className="container-page max-w-2xl pt-6">
      <Link href={`/tempat/${placeId}`} className="text-small font-semibold text-text-muted hover:text-text">
        ← {place.data?.place.name}
      </Link>
      <h1 className="mt-2 text-h1 font-extrabold">{editing ? 'Edit ulasanmu' : 'Tulis ulasan'}</h1>
      <p className="text-small text-text-muted">Ulasan ini dipublikasikan di MAM!, bukan di Google Maps. Satu orang satu ulasan per tempat — kamu bisa mengeditnya kapan saja.</p>

      <form onSubmit={form.handleSubmit((v) => save.mutate(v))} className="mt-6 space-y-6" noValidate>
        <fieldset className="card space-y-3 p-4">
          <legend className="px-1 font-extrabold">Penilaian</legend>
          {DIMENSIONS.map(([key, label, hint]) => (
            <div key={key} className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-semibold">{label}</p>
                <p className="text-caption text-text-muted">{hint}</p>
              </div>
              <Controller control={form.control} name={`ratings.${key}`} render={({ field }) => <RatingInput value={field.value} onChange={field.onChange} label={label} />} />
            </div>
          ))}
          {errors.ratings && <p className="text-small text-danger">Beri nilai 1–5 untuk semua aspek.</p>}
          <div className="flex items-center justify-between rounded-md bg-primary-soft px-3 py-2">
            <span className="font-semibold">Pengalaman keseluruhan</span>
            <span className="text-h3 font-extrabold" aria-live="polite">
              {overall ? formatRating(overall) : '—'}
            </span>
          </div>
          <p className="text-caption text-text-muted">Nilai keseluruhan dihitung otomatis dari rata-rata lima aspek.</p>
        </fieldset>

        <div>
          <label htmlFor="text" className="font-extrabold">
            Ceritakan pengalamanmu
          </label>
          <textarea id="text" rows={6} {...form.register('text')} aria-invalid={!!errors.text} className="mt-2 w-full rounded-lg border border-border bg-surface p-3 outline-none focus:border-primary" placeholder="Menu yang dipesan, rasa, suasana, tips untuk pengunjung lain…" />
          <div className="flex justify-between text-caption">
            <span className="text-danger">{errors.text?.message}</span>
            <span className="text-text-muted">
              {form.watch('text').length}/{REVIEW_MAX_TEXT_LENGTH}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <label className="text-small font-semibold">
            Harga yang kamu bayar (Rp)
            <input type="number" inputMode="numeric" min={0} step={500} {...form.register('pricePaid')} className="mt-1 h-11 w-full rounded-md border border-border bg-surface px-3" placeholder="25000" />
            <span className="mt-1 block text-caption font-normal text-text-muted">Opsional — ditampilkan sebagai &quot;dilaporkan pengguna&quot;.</span>
          </label>
          <label className="text-small font-semibold">
            Tanggal kunjungan
            <input type="date" max={new Date().toISOString().slice(0, 10)} {...form.register('visitedAt')} className="mt-1 h-11 w-full rounded-md border border-border bg-surface px-3" />
          </label>
          <label className="text-small font-semibold">
            Cara makan
            <select {...form.register('visitType')} className="mt-1 h-11 w-full rounded-md border border-border bg-surface px-3">
              <option value="DINE_IN">Makan di tempat</option>
              <option value="TAKEAWAY">Bawa pulang</option>
              <option value="DELIVERY">Pesan-antar</option>
            </select>
          </label>
        </div>

        <div>
          <p className="font-extrabold">Foto makanan (opsional)</p>
          <p className="text-caption text-text-muted">Foto orisinal milikmu. Maks {MAX_PHOTOS_PER_REVIEW} foto, JPEG/PNG/WebP ≤ 8 MB. Data lokasi (GPS) pada foto dihapus otomatis.</p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {photos.map((p) => (
              <li key={p.id} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.thumbUrl} alt="Foto yang diunggah" className="h-24 w-24 rounded-md object-cover" />
                <button type="button" onClick={() => setPhotos((ps) => ps.filter((x) => x.id !== p.id))} aria-label="Hapus foto" className="absolute -right-2 -top-2 h-7 w-7 rounded-full bg-text text-small text-background">
                  ✕
                </button>
              </li>
            ))}
            {Array.from({ length: uploading }, (_, i) => (
              <li key={`u${i}`}>
                <Skeleton className="h-24 w-24" />
              </li>
            ))}
            {photos.length + uploading < MAX_PHOTOS_PER_REVIEW && (
              <li>
                <label className="flex h-24 w-24 cursor-pointer flex-col items-center justify-center rounded-md border-2 border-dashed border-border text-caption text-text-muted hover:border-primary">
                  <span className="text-2xl" aria-hidden>
                    📷
                  </span>
                  Tambah
                  <input type="file" accept={ALLOWED_IMAGE_MIME.join(',')} multiple className="sr-only" onChange={(e) => (onFiles(e.target.files), (e.target.value = ''))} />
                </label>
              </li>
            )}
          </ul>
        </div>

        <div className="flex flex-wrap gap-3">
          <Button type="submit" size="lg" loading={save.isPending} disabled={uploading > 0}>
            {editing ? 'Simpan perubahan' : 'Terbitkan ulasan'}
          </Button>
          {editing && (
            <Button type="button" variant="ghost" onClick={() => setConfirmDelete(true)} className="text-danger">
              Hapus ulasan
            </Button>
          )}
        </div>
      </form>

      <Modal open={confirmDelete} onClose={() => setConfirmDelete(false)} title="Hapus ulasan?">
        <p className="text-small text-text-muted">Ulasan dan fotonya akan dihapus dari MAM!. Kamu bisa menulis ulasan baru untuk tempat ini nanti.</p>
        <div className="mt-4 flex gap-2">
          <Button variant="danger" onClick={() => remove.mutate()} loading={remove.isPending}>
            Ya, hapus
          </Button>
          <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
            Batal
          </Button>
        </div>
      </Modal>
    </div>
  );
}
