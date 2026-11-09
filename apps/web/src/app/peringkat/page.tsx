'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { Avatar, EmptyState, ErrorState, Skeleton } from '@/components/ui';
import { api } from '@/lib/api';

export default function LeaderboardPage() {
  const q = useQuery({ queryKey: ['leaderboard'], queryFn: api.community.leaderboard });
  return (
    <div className="container-page max-w-2xl space-y-4 pt-6">
      <h1 className="text-h1 font-extrabold">🏆 Peringkat komunitas</h1>
      <p className="text-small text-text-muted">
        Peringkat 90 hari terakhir berdasarkan <strong>kualitas</strong> ulasan (isi yang informatif, foto orisinal, detail harga & kunjungan) dan reaksi &quot;Membantu&quot; dari pengguna lain — bukan sekadar jumlah ulasan.
      </p>
      {q.isLoading && <Skeleton className="h-60 w-full" />}
      {q.error && <ErrorState onRetry={() => q.refetch()} />}
      {q.data && !q.data.length && <EmptyState title="Belum ada peringkat" body="Tulis ulasan berkualitas untuk masuk peringkat!" />}
      <ol className="space-y-2">
        {q.data?.map((e) => (
          <li key={e.userId} className="card flex items-center gap-3 p-3">
            <span className="w-8 text-center text-h3 font-extrabold">{e.rank <= 3 ? ['🥇', '🥈', '🥉'][e.rank - 1] : e.rank}</span>
            <Avatar src={e.avatarUrl} name={e.displayName} />
            <div className="min-w-0 flex-1">
              <Link href={`/u/${e.username}`} className="font-bold hover:underline">{e.displayName}</Link>
              <p className="text-caption text-text-muted">{e.reviewCount} ulasan · {e.helpfulReceived} 👍</p>
            </div>
            <span className="font-extrabold" title="Skor kualitas">{e.qualityScore.toFixed(1)}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
