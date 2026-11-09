'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '@mam/api-client';
import { hasRole, useMe, useToast } from '@/components/shell';
import { Button, Card, ErrorBox, Loading, PageHeader } from '@/components/ui';
import { api } from '@/lib/api';

export default function CategoriesPage() {
  const me = useMe();
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ['categories'], queryFn: api.admin.categories });
  const toggle = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => api.admin.updateCategory(id, { isActive }),
    onSuccess: () => {
      toast('success', 'Kategori diperbarui.');
      qc.invalidateQueries({ queryKey: ['categories'] });
    },
    onError: (e) => toast('error', e instanceof ApiError ? e.message : 'Gagal.'),
  });
  return (
    <>
      <PageHeader title="Kategori" subtitle="Kategori dipetakan ke tipe Google Places (New) untuk pencarian sekitar. Kategori tanpa tipe memakai Text Search." />
      {q.isLoading ? <Loading /> : q.error ? <ErrorBox error={q.error} onRetry={() => q.refetch()} /> : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[640px] text-small">
            <thead className="bg-surface-muted text-left text-caption text-text-muted">
              <tr><th className="p-3">Kategori</th><th className="p-3">Tipe Google</th><th className="p-3 text-right">Restoran</th><th className="p-3">Status</th><th className="p-3" /></tr>
            </thead>
            <tbody>
              {q.data?.map((c) => (
                <tr key={c.id} className="border-t border-border">
                  <td className="p-3">{c.emoji} <strong>{c.nameId}</strong> <span className="text-text-muted">/ {c.nameEn}</span></td>
                  <td className="p-3 text-caption">{(c as { googleTypes?: string[] }).googleTypes?.join(', ') || <em>Text Search</em>}</td>
                  <td className="p-3 text-right tabular-nums">{c.restaurantCount}</td>
                  <td className="p-3">{c.isActive ? 'Aktif' : 'Nonaktif'}</td>
                  <td className="p-3 text-right">{hasRole(me, 'ADMIN') && <Button variant="outline" loading={toggle.isPending} onClick={() => toggle.mutate({ id: c.id, isActive: !c.isActive })}>{c.isActive ? 'Nonaktifkan' : 'Aktifkan'}</Button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}
