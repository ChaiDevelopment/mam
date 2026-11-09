import Link from 'next/link';
import { CommunitySections } from '@/components/community-sections';
import { DiscoveryPanel } from '@/components/discovery';
import { DiceIllustration } from '@/components/illustrations';
import { SectionHeader } from '@/components/ui';

export default function HomePage() {
  return (
    <div className="container-page space-y-10 pt-6">
      <section className="flex flex-col gap-2">
        <p className="text-small font-bold uppercase tracking-wider text-primary-dark">Discover. Review. Eat.</p>
        <h1 className="text-h1 font-extrabold sm:text-display">Mau makan apa hari ini?</h1>
        <p className="max-w-xl text-text-muted">Tempat makan di sekitarmu, ulasan jujur dari komunitas, dan harga yang dilaporkan langsung oleh pengunjung.</p>
      </section>

      <section>
        <SectionHeader title="📍 Di sekitarmu" action={<Link href="/jelajah" className="tap text-small font-bold text-primary-dark hover:underline">Lihat semua & filter →</Link>} />
        <DiscoveryPanel />
      </section>

      <Link href="/kejutan" className="card flex items-center gap-4 bg-secondary-soft p-5 transition-shadow hover:shadow-raised">
        <DiceIllustration className="h-16 w-16 shrink-0 hover:animate-wiggle" />
        <div>
          <h2 className="text-h3 font-extrabold">Bingung? Biar MAM! yang pilih!</h2>
          <p className="text-small text-text-muted">Rekomendasi acak tapi tetap relevan — sesuai radius, budget, dan selera kamu.</p>
        </div>
      </Link>

      <CommunitySections />
    </div>
  );
}
