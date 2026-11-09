'use client';

import { ErrorState } from '@/components/ui';

export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="container-page max-w-xl pt-10">
      <ErrorState message="Halaman ini gagal dimuat. Periksa koneksi lalu coba lagi." onRetry={reset} />
    </div>
  );
}
