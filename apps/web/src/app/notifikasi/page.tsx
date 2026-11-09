'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatDate } from '@mam/api-client';
import Link from 'next/link';
import { Button, EmptyState, ErrorState, Skeleton } from '@/components/ui';
import { api } from '@/lib/api';

const ICON = { REVIEW_REACTION: '👍', REVIEW_MODERATED: '🛡️', BADGE_EARNED: '🏅', REPORT_RESOLVED: '✅', SYSTEM: '📣', PLACE_APPROVED: '📍', PLACE_REJECTED: '📝' } as const;

export default function NotificationsPage() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['notifications'], queryFn: () => api.notifications.list(1) });
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['notifications'] });
  };
  const read = useMutation({ mutationFn: api.notifications.read, onSuccess: invalidate });
  const readAll = useMutation({ mutationFn: api.notifications.readAll, onSuccess: invalidate });
  return (
    <div className="container-page max-w-2xl space-y-4 pt-6">
      <div className="flex items-center justify-between">
        <h1 className="text-h1 font-extrabold">Notifikasi</h1>
        {!!q.data?.unread && (
          <Button variant="ghost" size="sm" onClick={() => readAll.mutate()} loading={readAll.isPending}>
            Tandai semua dibaca
          </Button>
        )}
      </div>
      {q.isLoading && <Skeleton className="h-32 w-full" />}
      {q.error && <ErrorState onRetry={() => q.refetch()} />}
      {q.data && !q.data.items.length && <EmptyState title="Belum ada notifikasi" body="Reaksi, lencana, dan info moderasi akan muncul di sini." />}
      <ul className="space-y-2">
        {q.data?.items.map((n) => (
          <li key={n.id} className={`card flex gap-3 p-3 ${n.readAt ? 'opacity-70' : 'border-primary'}`}>
            <span aria-hidden className="text-xl">{ICON[n.type]}</span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{n.title}</p>
              <p className="text-small text-text-muted">{n.body}</p>
              <p className="text-caption text-text-muted">{formatDate(n.createdAt, { dateStyle: 'medium', timeStyle: 'short' })}</p>
              {n.link && <Link href={n.link} className="text-small font-semibold text-primary-dark" onClick={() => !n.readAt && read.mutate(n.id)}>Lihat →</Link>}
            </div>
            {!n.readAt && (
              <button onClick={() => read.mutate(n.id)} className="self-start text-caption text-text-muted hover:text-text" aria-label="Tandai dibaca">
                ●
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
