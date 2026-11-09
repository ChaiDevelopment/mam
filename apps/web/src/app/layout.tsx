import type { Metadata, Viewport } from 'next';
import { Plus_Jakarta_Sans } from 'next/font/google';
import { Providers } from '@/components/providers';
import { SiteFooter, SiteHeader, BottomNav } from '@/components/nav';
import { VerifyEmailBanner } from '@/components/verify-email-banner';
// Leaflet styles are global (loaded once) — importing them from a dynamic() chunk can stall client navigation.
import 'leaflet/dist/leaflet.css';
import './globals.css';

const jakarta = Plus_Jakarta_Sans({ subsets: ['latin'], weight: ['400', '500', '600', '700', '800'], variable: '--font-jakarta', display: 'swap' });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'),
  title: { default: 'MAM! — Discover. Review. Eat.', template: '%s · MAM!' },
  description: 'Temukan tempat makan di sekitarmu, baca ulasan jujur komunitas, dan bagikan pengalaman kulinermu.',
  openGraph: { siteName: 'MAM!', locale: 'id_ID', type: 'website' },
  icons: { icon: '/favicon.svg' },
};

export const viewport: Viewport = { themeColor: '#FF9F43', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" className={jakarta.variable}>
      <body className="min-h-screen font-sans">
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-surface focus:px-4 focus:py-2">
          Lewati ke konten utama
        </a>
        <Providers>
          <SiteHeader />
          <VerifyEmailBanner />
          <main id="main" className="pb-24 md:pb-10">
            {children}
          </main>
          <SiteFooter />
          <BottomNav />
        </Providers>
      </body>
    </html>
  );
}
