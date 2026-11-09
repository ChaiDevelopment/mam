'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '@mam/api-client';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useAuth, useToast } from '@/components/providers';
import { Button, EmptyState, ErrorState, Skeleton } from '@/components/ui';
import { api } from '@/lib/api';

export default function CollectionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { me } = useAuth();
  const toast = useToast();
  const router = useRouter();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['collection', id], queryFn: () => api.collections.get(id) });
  const own = q.data && me?.userId === q.data.owner.userId;
  const removeItem = useMutation({
    mutationFn: (itemId: string) => api.collections.removeItem(id, itemId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['collection', id] }),
    onError: (e) => toast('error', e instanceof ApiError ? e.message : 'Gagal menghapus.'),
  });
  const togglePublic = useMutation({
    mutationFn: () => api.collections.update(id, { isPublic: !q.data!.isPublic }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['collection', id] }),
  });
  const del = useMutation({
    mutationFn: () => api.collections.remove(id),
    onSuccess: () => {
      toast('success', 'Koleksi dihapus.');
      qc.invalidateQueries({ queryKey: ['collections'] });
      router.push('/koleksi');
    },
  });
  if (q.isLoading) return <div className="container-page pt-6"><Skeleton className="h-40 w-full" /></div>;
  if (q.error || !q.data) return <div className="container-page pt-6"><ErrorState message={q.error instanceof ApiError ? q.error.message : undefined} onRetry={() => q.refetch()} /></div>;
  const c = q.data;
  return (
    <div className="container-page max-w-3xl space-y-4 pt-6">
      <Link href={own ? '/koleksi' : `/u/${c.owner.username}`} className="text-small font-semibold text-text-muted">
        ← {own ? 'Koleksiku' : c.owner.displayName}
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-h1 font-extrabold">📚 {c.name}</h1>
          {c.description && <p className="text-text-muted">{c.description}</p>}
          <p className="text-caption text-text-muted">
            oleh {c.owner.displayName} · {c.itemCount} tempat · {c.isPublic ? 'Publik' : 'Pribadi'}
          </p>
        </div>
        {own && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => togglePublic.mutate()} loading={togglePublic.isPending}>
              Jadikan {c.isPublic ? 'pribadi' : 'publik'}
            </Button>
            {c.isPublic && (
              <Button variant="outline" size="sm" onClick={() => navigator.clipboard.writeText(window.location.href).then(() => toast('success', 'Tautan disalin!'))}>
                🔗 Bagikan
              </Button>
            )}
            <Button variant="ghost" size="sm" className="text-danger" onClick={() => confirm('Hapus koleksi ini?') && del.mutate()}>
              Hapus
            </Button>
          </div>
        )}
      </div>
      {!c.items.length && <EmptyState title="Koleksi masih kosong" body="Buka halaman tempat lalu tekan “Koleksi” untuk menambahkannya." />}
      <ul className="space-y-2">
        {c.items.map((it) => (
          <li key={it.id} className="card flex items-center justify-between gap-3 p-3">
            <div className="min-w-0">
              <Link href={it.restaurant.placeKey ? `/tempat/${it.restaurant.placeKey}` : '#'} className="font-bold hover:underline">
                {it.restaurant.name ?? 'Nama tidak tersedia'}
              </Link>
              {it.note && <p className="text-small text-text-muted">“{it.note}”</p>}
            </div>
            {own && (
              <Button variant="ghost" size="sm" onClick={() => removeItem.mutate(it.id)} aria-label={`Hapus ${it.restaurant.name ?? 'tempat'} dari koleksi`}>
                ✕
              </Button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
