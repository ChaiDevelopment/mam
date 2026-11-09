import { EmptyPlateIllustration } from '@/components/illustrations';
import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="container-page flex flex-col items-center py-16 text-center">
      <EmptyPlateIllustration className="h-36 w-44" />
      <h1 className="mt-4 text-h1 font-extrabold">Piringnya kosong…</h1>
      <p className="text-text-muted">Halaman yang kamu cari tidak ditemukan.</p>
      <Link href="/" className="mt-4 rounded-pill bg-primary px-5 py-2.5 font-bold text-on-primary">Kembali ke beranda</Link>
    </div>
  );
}
