'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '@mam/api-client';
import Link from 'next/link';
import { useState } from 'react';
import { useToast } from '@/components/providers';
import { Button, EmptyState, ErrorState, Skeleton } from '@/components/ui';
import { api } from '@/lib/api';

export default function CollectionsPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ['collections'], queryFn: api.collections.mine });
  const [name, setName] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const create = useMutation({
    mutationFn: () => api.collections.create({ name, isPublic }),
    onSuccess: () => {
      setName('');
      toast('success', 'Koleksi dibuat 📚');
      qc.invalidateQueries({ queryKey: ['collections'] });
    },
    onError: (e) => toast('error', e instanceof ApiError ? e.message : 'Gagal membuat koleksi.'),
  });
  return (
    <div className="container-page max-w-3xl space-y-5 pt-6">
      <h1 className="text-h1 font-extrabold">Koleksi kulinerku</h1>
      <form
        className="card flex flex-wrap items-end gap-3 p-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) create.mutate();
        }}
      >
        <label className="min-w-[200px] flex-1 text-small font-semibold">
          Nama koleksi baru
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="mis. Sarapan dekat kantor" className="mt-1 h-11 w-full rounded-md border border-border px-3" />
        </label>
        <label className="flex items-center gap-2 pb-3 text-small">
          <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} className="accent-primary" /> Publik
        </label>
        <Button type="submit" loading={create.isPending}>
          Buat
        </Button>
      </form>
      {q.isLoading && <Skeleton className="h-32 w-full" />}
      {q.error && <ErrorState onRetry={() => q.refetch()} />}
      {q.data && !q.data.length && <EmptyState title="Belum ada koleksi" body="Kelompokkan tempat favoritmu — misalnya “Ngopi santai” atau “Makan malam keluarga”." />}
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {q.data?.map((c) => (
          <li key={c.id}>
            <Link href={`/koleksi/${c.id}`} className="card block p-4 hover:shadow-raised">
              <p className="text-h3 font-extrabold">📚 {c.name}</p>
              {c.description && <p className="text-small text-text-muted">{c.description}</p>}
              <p className="mt-1 text-caption text-text-muted">
                {c.itemCount} tempat · {c.isPublic ? 'Publik' : 'Pribadi'}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
