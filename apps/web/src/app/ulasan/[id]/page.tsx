'use client';

import { useQuery } from '@tanstack/react-query';
import { ApiError } from '@mam/api-client';
import { useParams } from 'next/navigation';
import { ReviewCard } from '@/components/review-card';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui';
import { api } from '@/lib/api';

export default function ReviewPage() {
  const { id } = useParams<{ id: string }>();
  const q = useQuery({ queryKey: ['reviews', 'one', id], queryFn: () => api.reviews.get(id) });
  return (
    <div className="container-page max-w-2xl pt-6">
      {q.isLoading && <Skeleton className="h-60 w-full" />}
      {q.error instanceof ApiError && q.error.status === 404 && <EmptyState title="Ulasan tidak ditemukan" body="Ulasan ini mungkin sudah dihapus atau sedang dimoderasi." />}
      {q.error && !(q.error instanceof ApiError && q.error.status === 404) && <ErrorState onRetry={() => q.refetch()} />}
      {q.data && <ReviewCard review={q.data} showRestaurant />}
    </div>
  );
}
