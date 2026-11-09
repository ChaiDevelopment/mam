'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatIdr, formatRating } from '@mam/api-client';
import Link from 'next/link';
import { Button, EmptyState, ErrorState, LinkButton, Skeleton } from '@/components/ui';
import { api } from '@/lib/api';

export default function FavoritesPage() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['favorites'], queryFn: api.favorites.list });
  const remove = useMutation({
    mutationFn: (id: string) => api.favorites.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['favorites'] }),
  });
  return (
    <div className="container-page max-w-3xl space-y-4 pt-6">
      <h1 className="text-h1 font-extrabold">❤️ Favorit</h1>
      {q.isLoading && <Skeleton className="h-32 w-full" />}
      {q.error && <ErrorState onRetry={() => q.refetch()} />}
      {q.data && !q.data.length && <EmptyState title="Belum ada favorit" body="Tekan “Simpan” di halaman tempat untuk menyimpannya di sini." action={<LinkButton href="/jelajah">Jelajahi tempat</LinkButton>} />}
      <ul className="space-y-2">
        {q.data?.map((f) => (
          <li key={f.restaurant.id} className="card flex items-center justify-between gap-3 p-3">
            <div className="min-w-0">
              <Link href={f.restaurant.placeKey ? `/tempat/${f.restaurant.placeKey}` : '#'} className="font-bold hover:underline">
                {f.restaurant.name ?? 'Nama tidak tersedia'}
              </Link>
              <p className="text-caption text-text-muted">
                MAM! {formatRating(f.restaurant.stats.averageOverall)} ({f.restaurant.stats.reviewCount} ulasan)
                {f.restaurant.stats.medianPricePaid !== null && ` · ~${formatIdr(f.restaurant.stats.medianPricePaid)}`}
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => remove.mutate(f.restaurant.id)} aria-label={`Hapus ${f.restaurant.name ?? 'tempat'} dari favorit`}>
              Hapus
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
