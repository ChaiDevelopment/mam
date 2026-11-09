'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useChosenLocation } from '@/components/providers';
import { ReviewCard } from '@/components/review-card';
import { Button, CardSkeleton, Chip, EmptyState, ErrorState } from '@/components/ui';
import { api } from '@/lib/api';

export default function FeedPage() {
  const { location, radius } = useChosenLocation();
  const [scope, setScope] = useState<'latest' | 'nearby'>('latest');
  const q = useInfiniteQuery({
    queryKey: ['reviews', 'feed', scope, scope === 'nearby' ? [location?.lat, location?.lng, radius] : null],
    queryFn: ({ pageParam }) => api.reviews.feed({ scope, page: pageParam, pageSize: 10, ...(scope === 'nearby' && location ? { lat: location.lat, lng: location.lng, radius } : {}) }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.hasMore ? last.page + 1 : undefined),
    enabled: scope === 'latest' || !!location,
  });
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <div className="container-page max-w-2xl space-y-4 pt-6">
      <h1 className="text-h1 font-extrabold">Ulasan komunitas</h1>
      <div className="flex gap-2">
        <Chip selected={scope === 'latest'} onClick={() => setScope('latest')}>
          Terbaru
        </Chip>
        <Chip selected={scope === 'nearby'} onClick={() => setScope('nearby')}>
          Di sekitarku
        </Chip>
      </div>
      {scope === 'nearby' && !location && <EmptyState title="Pilih lokasi dulu" body="Atur lokasimu di Beranda untuk melihat ulasan di sekitarmu." />}
      {q.isLoading && Array.from({ length: 3 }, (_, i) => <CardSkeleton key={i} />)}
      {q.error && <ErrorState onRetry={() => q.refetch()} />}
      {q.isSuccess && !items.length && <EmptyState title="Belum ada ulasan" body="Jadilah yang pertama berbagi pengalaman kuliner!" />}
      <div className="space-y-3">
        {items.map((r) => (
          <ReviewCard key={r.id} review={r} showRestaurant />
        ))}
      </div>
      {q.hasNextPage && (
        <Button variant="outline" className="w-full" onClick={() => q.fetchNextPage()} loading={q.isFetchingNextPage}>
          Muat lebih banyak
        </Button>
      )}
    </div>
  );
}
