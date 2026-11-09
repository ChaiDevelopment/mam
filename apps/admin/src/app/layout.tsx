import type { Metadata } from 'next';
import { Plus_Jakarta_Sans } from 'next/font/google';
import { AdminProviders } from '@/components/shell';
import './globals.css';

const jakarta = Plus_Jakarta_Sans({ subsets: ['latin'], weight: ['400', '600', '700', '800'], variable: '--font-jakarta', display: 'swap' });

export const metadata: Metadata = { title: { default: 'MAM! Admin', template: '%s · MAM! Admin' }, robots: { index: false, follow: false }, icons: { icon: '/favicon.svg' } };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" className={jakarta.variable}>
      <body className="min-h-screen font-sans">
        <AdminProviders>{children}</AdminProviders>
      </body>
    </html>
  );
}
