'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { api } from '@/lib/api';
import { MamLogo } from './illustrations';
import { useAuth } from './providers';
import { Avatar } from './ui';

const links = [
  { href: '/', label: 'Beranda', icon: '🏠' },
  { href: '/jelajah', label: 'Jelajah', icon: '🧭' },
  { href: '/kejutan', label: 'Kejutan', icon: '🎲' },
  { href: '/feed', label: 'Ulasan', icon: '💬' },
  { href: '/profil', label: 'Profil', icon: '🙂' },
];

function useUnread(enabled: boolean) {
  return useQuery({ queryKey: ['notifications', 'unread'], queryFn: () => api.notifications.list(1).then((r) => r.unread), enabled, refetchInterval: 60_000 });
}

export function SiteHeader() {
  const { me, loading } = useAuth();
  const path = usePathname();
  const unread = useUnread(!!me);
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur">
      <div className="container-page flex h-16 items-center justify-between gap-4">
        <Link href="/" aria-label="MAM! beranda">
          <MamLogo className="h-8 w-auto" />
        </Link>
        <nav aria-label="Navigasi utama" className="hidden items-center gap-1 md:flex">
          {links.slice(0, 4).map((l) => (
            <Link
              key={l.href}
              href={l.href}
              aria-current={path === l.href ? 'page' : undefined}
              className={`rounded-pill px-4 py-2 text-small font-semibold transition-colors ${path === l.href ? 'bg-primary-soft text-text' : 'text-text-muted hover:text-text'}`}
            >
              {l.label}
            </Link>
          ))}
          <Link href="/peringkat" className="rounded-pill px-4 py-2 text-small font-semibold text-text-muted hover:text-text">
            Peringkat
          </Link>
        </nav>
        <div className="flex items-center gap-2">
          {me && (
            <Link href="/notifikasi" aria-label={`Notifikasi${unread.data ? `, ${unread.data} belum dibaca` : ''}`} className="relative rounded-full p-2 hover:bg-surface-muted">
              <span aria-hidden>🔔</span>
              {!!unread.data && <span className="absolute right-0.5 top-0.5 min-w-[18px] rounded-pill bg-accent px-1 text-center text-caption font-bold text-white">{unread.data > 9 ? '9+' : unread.data}</span>}
            </Link>
          )}
          {loading ? (
            <span className="skeleton h-9 w-9 rounded-full" />
          ) : me ? (
            <Link href="/profil" className="hidden items-center gap-2 rounded-pill py-1 pl-1 pr-3 hover:bg-surface-muted md:flex">
              <Avatar src={me.avatarUrl} name={me.displayName} size={32} />
              <span className="text-small font-semibold">{me.displayName.split(' ')[0]}</span>
            </Link>
          ) : path.startsWith('/masuk') ? null : (
            <Link href={`/masuk?next=${encodeURIComponent(path)}`} className="rounded-pill bg-primary px-4 py-2 text-small font-bold text-on-primary shadow-card hover:bg-primary-dark">
              Masuk
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}

export function BottomNav() {
  const path = usePathname();
  return (
    <nav aria-label="Navigasi bawah" className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
      <ul className="grid grid-cols-5">
        {links.map((l) => {
          const active = l.href === '/' ? path === '/' : path.startsWith(l.href);
          return (
            <li key={l.href}>
              <Link href={l.href} aria-current={active ? 'page' : undefined} className={`flex flex-col items-center gap-0.5 py-2 text-caption font-semibold ${active ? 'text-text' : 'text-text-muted'}`}>
                <span aria-hidden className={`text-lg transition-transform ${active ? 'scale-110' : ''}`}>
                  {l.icon}
                </span>
                {l.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-12 hidden border-t border-border py-8 text-small text-text-muted md:block">
      <div className="container-page flex flex-wrap items-center justify-between gap-4">
        <p>
          <strong className="text-text">MAM!</strong> — Discover. Review. Eat. Bukan layanan pesan-antar.
        </p>
        <nav aria-label="Tautan kaki" className="flex gap-4">
          <Link href="/tentang-data" className="hover:text-text">
            Sumber data
          </Link>
          <Link href="/privasi" className="hover:text-text">
            Privasi
          </Link>
          <Link href="/ketentuan" className="hover:text-text">
            Ketentuan
          </Link>
        </nav>
      </div>
    </footer>
  );
}
