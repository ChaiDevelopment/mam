'use client';

import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { ApiError } from '@mam/api-client';
import { ROLE_RANK, type Me, type Role } from '@mam/shared-types';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { api } from '@/lib/api';

const MeContext = createContext<Me | null>(null);
export const useMe = () => useContext(MeContext)!;
export const hasRole = (me: Me | null, min: Role) => !!me && ROLE_RANK[me.role] >= ROLE_RANK[min];

type Toast = { id: number; kind: 'success' | 'error'; text: string };
const ToastCtx = createContext<(kind: Toast['kind'], text: string) => void>(() => undefined);
export const useToast = () => useContext(ToastCtx);

const NAV: { href: string; label: string; min: Role }[] = [
  { href: '/', label: 'Ringkasan', min: 'MODERATOR' },
  { href: '/pengajuan', label: 'Pengajuan tempat', min: 'MODERATOR' },
  { href: '/laporan', label: 'Laporan', min: 'MODERATOR' },
  { href: '/ulasan', label: 'Moderasi ulasan', min: 'MODERATOR' },
  { href: '/pengguna', label: 'Pengguna', min: 'MODERATOR' },
  { href: '/restoran', label: 'Restoran', min: 'MODERATOR' },
  { href: '/kategori', label: 'Kategori', min: 'MODERATOR' },
  { href: '/audit', label: 'Log audit', min: 'ADMIN' },
  { href: '/sistem', label: 'Sistem', min: 'ADMIN' },
];

function Gate({ children }: { children: ReactNode }) {
  const path = usePathname();
  const q = useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      try {
        return await api.auth.me();
      } catch (e) {
        if (e instanceof ApiError && (e.status === 401 || e.status === 403)) return null;
        throw e;
      }
    },
  });
  if (path === '/masuk') return <>{children}</>;
  if (q.isLoading) return <div className="p-10 text-center text-text-muted">Memuat…</div>;
  if (q.error) return <div className="p-10 text-center">Tidak dapat terhubung ke API. <button className="underline" onClick={() => q.refetch()}>Coba lagi</button></div>;
  if (!q.data) {
    if (typeof window !== 'undefined') window.location.href = `/masuk?next=${encodeURIComponent(path)}`;
    return null;
  }
  // UX gate only; every admin endpoint is authorized server-side.
  if (!hasRole(q.data, 'MODERATOR'))
    return (
      <div className="mx-auto max-w-md p-10 text-center">
        <h1 className="text-h2 font-extrabold">Akses ditolak</h1>
        <p className="mt-2 text-text-muted">Akun {q.data.email} tidak memiliki peran staf MAM!.</p>
        <button className="mt-4 underline" onClick={() => api.auth.logout().then(() => (window.location.href = '/masuk'))}>Keluar</button>
      </div>
    );
  return (
    <MeContext.Provider value={q.data}>
      <div className="flex min-h-screen flex-col md:flex-row">
        <aside className="border-b border-border bg-surface md:min-h-screen md:w-60 md:border-b-0 md:border-r">
          <div className="flex items-center justify-between p-4">
            <span className="text-h3 font-extrabold">MAM<span className="text-accent">!</span> <span className="text-small font-semibold text-text-muted">Admin</span></span>
          </div>
          <nav aria-label="Navigasi admin" className="flex gap-1 overflow-x-auto px-2 pb-2 md:flex-col md:overflow-visible">
            {NAV.filter((n) => hasRole(q.data, n.min)).map((n) => {
              const active = n.href === '/' ? path === '/' : path.startsWith(n.href);
              return (
                <Link key={n.href} href={n.href} aria-current={active ? 'page' : undefined} className={`shrink-0 rounded-md px-3 py-2 text-small font-semibold ${active ? 'bg-primary-soft text-text' : 'text-text-muted hover:bg-surface-muted hover:text-text'}`}>
                  {n.label}
                </Link>
              );
            })}
          </nav>
          <div className="hidden border-t border-border p-4 text-caption text-text-muted md:block">
            <p className="truncate font-semibold text-text">{q.data.displayName}</p>
            <p>{q.data.role}</p>
            <button className="mt-2 underline" onClick={() => api.auth.logout().then(() => (window.location.href = '/masuk'))}>Keluar</button>
          </div>
        </aside>
        <main id="main" className="min-w-0 flex-1 p-4 md:p-8">{children}</main>
      </div>
    </MeContext.Provider>
  );
}

export function AdminProviders({ children }: { children: ReactNode }) {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { staleTime: 15_000, refetchOnWindowFocus: false, retry: 1 } } }));
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((kind: Toast['kind'], text: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, kind, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }, []);
  return (
    <QueryClientProvider client={client}>
      <ToastCtx.Provider value={push}>
        <Gate>{children}</Gate>
        <div aria-live="polite" className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
          {toasts.map((t) => (
            <div key={t.id} role={t.kind === 'error' ? 'alert' : 'status'} className={`rounded-md px-4 py-2 text-small font-semibold text-white shadow-raised ${t.kind === 'error' ? 'bg-danger' : 'bg-success'}`}>
              {t.text}
            </div>
          ))}
        </div>
      </ToastCtx.Provider>
    </QueryClientProvider>
  );
}
