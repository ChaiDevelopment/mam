'use client';

import { useQuery } from '@tanstack/react-query';
import { formatDate } from '@mam/api-client';
import { CATEGORY_LABELS_ID } from '@mam/shared-types';
import Link from 'next/link';
import { BarChart } from '@/components/bar-chart';
import { Card, ErrorBox, Loading, PageHeader } from '@/components/ui';
import { api } from '@/lib/api';

export default function OverviewPage() {
  const q = useQuery({ queryKey: ['overview'], queryFn: api.admin.overview, refetchInterval: 60_000 });
  if (q.isLoading) return <Loading />;
  if (q.error || !q.data) return <ErrorBox error={q.error} onRetry={() => q.refetch()} />;
  const t = q.data.totals;
  const tiles = [
    { label: 'Pengguna terdaftar', value: t.users },
    { label: 'Aktif 30 hari', value: t.activeUsers30d },
    { label: 'Ulasan terbit', value: t.publishedReviews },
    { label: 'Restoran direferensikan', value: t.restaurants },
    { label: 'Laporan menunggu', value: t.openReports, href: '/laporan', alert: t.openReports > 0 },
    { label: 'Ulasan menunggu moderasi', value: t.pendingReviews, href: '/ulasan?status=PENDING', alert: t.pendingReviews > 0 },
    { label: 'Pengajuan tempat menunggu', value: t.pendingPlaces, href: '/pengajuan', alert: t.pendingPlaces > 0 },
  ];
  return (
    <>
      <PageHeader title="Ringkasan" subtitle="Diperbarui otomatis setiap menit" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
        {tiles.map((s) => {
          const body = (
            <Card className={s.alert ? 'border-primary' : ''}>
              <p className="text-caption text-text-muted">{s.label}</p>
              <p className="text-h1 font-extrabold tabular-nums">{s.value.toLocaleString('id-ID')}</p>
              {s.alert && <p className="text-caption font-semibold text-primary-dark">⚠ Perlu tindakan →</p>}
            </Card>
          );
          return s.href ? <Link key={s.label} href={s.href}>{body}</Link> : <div key={s.label}>{body}</div>;
        })}
      </div>
      <div className="mt-6 grid gap-4 lg:grid-cols-[2fr_1fr]">
        <Card>
          <BarChart
            title="Ulasan baru per hari (30 hari, WIB)"
            valueLabel="ulasan"
            data={q.data.reviewTrend.map((d) => ({ label: d.date.slice(5).replace('-', '/'), value: d.count, detail: formatDate(`${d.date}T12:00:00+07:00`, { dateStyle: 'full' }) }))}
          />
        </Card>
        <Card>
          {q.data.popularCategories.length ? (
            <BarChart horizontal title="Kategori terpopuler (ulasan terbit)" valueLabel="ulasan" data={q.data.popularCategories.map((c) => ({ label: CATEGORY_LABELS_ID[c.slug] ?? c.slug, value: c.reviewCount }))} />
          ) : (
            <p className="text-small text-text-muted">Belum ada data kategori.</p>
          )}
        </Card>
      </div>
      <Card className="mt-6">
        <h2 className="mb-2 font-bold">Aktivitas terbaru</h2>
        {q.data.recentActivity.length ? (
          <ul className="divide-y divide-border text-small">
            {q.data.recentActivity.map((a) => (
              <li key={a.id} className="flex flex-wrap justify-between gap-2 py-2">
                <span>
                  <strong>{a.action}</strong> · {a.targetType} {typeof a.metadata?.name === 'string' ? `“${a.metadata.name}”` : a.targetId?.slice(0, 8)} {a.actor && <span className="text-text-muted">oleh {a.actor.displayName}</span>}
                </span>
                <span className="text-text-muted">{formatDate(a.createdAt, { dateStyle: 'short', timeStyle: 'short' })}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-small text-text-muted">Belum ada aktivitas admin.</p>
        )}
      </Card>
    </>
  );
}
