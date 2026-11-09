'use client';

import { useQuery } from '@tanstack/react-query';
import { ApiError, formatDate } from '@mam/api-client';
import { useParams } from 'next/navigation';
import { ReviewCard } from '@/components/review-card';
import { Avatar, EmptyState, ErrorState, Skeleton } from '@/components/ui';
import { api } from '@/lib/api';

export default function PublicProfilePage() {
  const { username } = useParams<{ username: string }>();
  const profile = useQuery({ queryKey: ['profile', username], queryFn: () => api.users.profile(username) });
  const reviews = useQuery({ queryKey: ['reviews', 'user', username], queryFn: () => api.users.reviews(username), enabled: profile.isSuccess });
  if (profile.isLoading) return <div className="container-page pt-6"><Skeleton className="h-32 w-full" /></div>;
  if (profile.error || !profile.data)
    return (
      <div className="container-page pt-6">
        {profile.error instanceof ApiError && profile.error.status === 404 ? <EmptyState title="Pengguna tidak ditemukan" /> : <ErrorState onRetry={() => profile.refetch()} />}
      </div>
    );
  const p = profile.data;
  return (
    <div className="container-page max-w-3xl space-y-6 pt-6">
      <section className="card flex items-center gap-4 p-5">
        <Avatar src={p.avatarUrl} name={p.displayName} size={72} />
        <div>
          <h1 className="text-h1 font-extrabold">{p.displayName}</h1>
          <p className="text-small text-text-muted">@{p.username} · bergabung {formatDate(p.joinedAt, { month: 'long', year: 'numeric' })}</p>
          {p.bio && <p className="mt-1 text-small">{p.bio}</p>}
          <p className="mt-2 text-small"><strong>{p.stats.reviewCount}</strong> ulasan · <strong>{p.stats.photoCount}</strong> foto · <strong>{p.stats.helpfulReceived}</strong> 👍</p>
        </div>
      </section>
      {p.badges.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label="Lencana">
          {p.badges.map((b) => <li key={b.code} title={b.description} className="rounded-pill bg-secondary-soft px-3 py-1.5 text-small font-semibold">🏅 {b.name}</li>)}
        </ul>
      )}
      <section className="space-y-3">
        <h2 className="font-extrabold">Ulasan</h2>
        {reviews.isLoading && <Skeleton className="h-40 w-full" />}
        {reviews.data && !reviews.data.items.length && <EmptyState title="Belum ada ulasan" />}
        {reviews.data?.items.map((r) => <ReviewCard key={r.id} review={r} showRestaurant />)}
      </section>
    </div>
  );
}
