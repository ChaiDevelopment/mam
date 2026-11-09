'use client';

import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '@mam/api-client';
import type { Me } from '@mam/shared-types';
import { DEFAULT_RADIUS_METERS, RADIUS_OPTIONS_METERS } from '@mam/shared-types';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api } from '@/lib/api';

// ───────────────── React Query ─────────────────
function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: (count, err) => !(err instanceof ApiError && err.status >= 400 && err.status < 500) && count < 2,
        refetchOnWindowFocus: false,
      },
    },
  });
}

// ───────────────── Auth ─────────────────
interface AuthCtx {
  me: Me | null;
  loading: boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}
const AuthContext = createContext<AuthCtx>({ me: null, loading: true, refresh: async () => undefined, logout: async () => undefined });

function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
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
    staleTime: 60_000,
  });
  const value = useMemo<AuthCtx>(
    () => ({
      me: q.data ?? null,
      loading: q.isLoading,
      refresh: async () => {
        await qc.invalidateQueries({ queryKey: ['me'] });
      },
      logout: async () => {
        await api.auth.logout().catch(() => undefined);
        qc.clear();
        window.location.href = '/';
      },
    }),
    [q.data, q.isLoading, qc],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
export const useAuth = () => useContext(AuthContext);

// ───────────────── Toasts ─────────────────
type Toast = { id: number; kind: 'success' | 'error' | 'info'; text: string };
const ToastContext = createContext<(kind: Toast['kind'], text: string) => void>(() => undefined);
export const useToast = () => useContext(ToastContext);

function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((kind: Toast['kind'], text: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-2), { id, kind, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }, []);
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex flex-col items-center gap-2 px-4 md:bottom-6">
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.kind === 'error' ? 'alert' : 'status'}
            className={`pointer-events-auto animate-pop-in rounded-pill px-4 py-2.5 text-small font-semibold shadow-raised ${
              t.kind === 'error' ? 'bg-danger text-white' : t.kind === 'success' ? 'bg-success text-white' : 'bg-text text-background'
            }`}
          >
            {t.text}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

// ───────────────── Location (session only — never persisted long-term) ─────────────────
export interface ChosenLocation {
  lat: number;
  lng: number;
  label: string;
  source: 'gps' | 'manual';
  accuracy?: number;
}
interface LocationCtx {
  location: ChosenLocation | null;
  setLocation: (l: ChosenLocation | null) => void;
  radius: number;
  setRadius: (r: number) => void;
}
const LocationContext = createContext<LocationCtx>({ location: null, setLocation: () => undefined, radius: DEFAULT_RADIUS_METERS, setRadius: () => undefined });
export const useChosenLocation = () => useContext(LocationContext);

function LocationProvider({ children }: { children: ReactNode }) {
  const { me } = useAuth();
  const [location, setLoc] = useState<ChosenLocation | null>(null);
  const [radius, setRad] = useState<number>(DEFAULT_RADIUS_METERS);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('mam:loc');
      if (raw) setLoc(JSON.parse(raw));
      const r = Number(localStorage.getItem('mam:radius'));
      if ((RADIUS_OPTIONS_METERS as readonly number[]).includes(r)) setRad(r);
    } catch {
      /* storage unavailable */
    }
  }, []);
  useEffect(() => {
    if (me?.preferences.defaultRadiusMeters && !localStorage.getItem('mam:radius')) setRad(me.preferences.defaultRadiusMeters);
  }, [me]);

  const setLocation = useCallback((l: ChosenLocation | null) => {
    setLoc(l);
    try {
      if (l) sessionStorage.setItem('mam:loc', JSON.stringify(l));
      else sessionStorage.removeItem('mam:loc');
    } catch {
      /* ignore */
    }
  }, []);
  const setRadius = useCallback((r: number) => {
    setRad(r);
    try {
      localStorage.setItem('mam:radius', String(r));
    } catch {
      /* ignore */
    }
  }, []);
  return <LocationContext.Provider value={{ location, setLocation, radius, setRadius }}>{children}</LocationContext.Provider>;
}

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(makeQueryClient);
  return (
    <QueryClientProvider client={client}>
      <AuthProvider>
        <LocationProvider>
          <ToastProvider>{children}</ToastProvider>
        </LocationProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
