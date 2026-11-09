'use client';

import { formatRating } from '@mam/api-client';
import Link from 'next/link';
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { EmptyPlateIllustration } from './illustrations';

// ───────────────── Button ─────────────────
type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
const variants: Record<Variant, string> = {
  primary: 'bg-primary text-on-primary hover:bg-primary-dark shadow-card',
  secondary: 'bg-secondary-soft text-text hover:bg-secondary',
  outline: 'border border-border bg-surface text-text hover:bg-surface-muted',
  ghost: 'bg-transparent text-text hover:bg-surface-muted',
  danger: 'bg-danger text-white hover:opacity-90',
};
export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' | 'lg'; loading?: boolean }>(
  function Button({ variant = 'primary', size = 'md', loading, className = '', children, disabled, ...rest }, ref) {
    const sizes = { sm: 'h-9 px-3 text-small', md: 'h-11 px-5 text-body', lg: 'h-12 px-6 text-body' };
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        className={`inline-flex items-center justify-center gap-2 rounded-pill font-semibold transition-all duration-150 active:scale-[.97] disabled:cursor-not-allowed disabled:opacity-60 ${variants[variant]} ${sizes[size]} ${className}`}
        {...rest}
      >
        {loading && <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />}
        {children}
      </button>
    );
  },
);

export function LinkButton({ href, variant = 'primary', className = '', children, external }: { href: string; variant?: Variant; className?: string; children: ReactNode; external?: boolean }) {
  const cls = `inline-flex h-11 items-center justify-center gap-2 rounded-pill px-5 font-semibold transition-all active:scale-[.97] ${variants[variant]} ${className}`;
  return external ? (
    <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>
      {children}
    </a>
  ) : (
    <Link href={href} className={cls}>
      {children}
    </Link>
  );
}

// ───────────────── Chips ─────────────────
export function Chip({ selected, onClick, children, className = '' }: { selected?: boolean; onClick?: () => void; children: ReactNode; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-pill border px-3.5 py-1.5 text-small font-semibold transition-colors ${
        selected ? 'border-primary bg-primary-soft text-text' : 'border-border bg-surface text-text-muted hover:text-text'
      } ${className}`}
    >
      {children}
    </button>
  );
}

// ───────────────── Source labels (Google vs MAM!) ─────────────────
export function SourceTag({ source }: { source: 'google' | 'mam' | 'delivery' | 'community-price' | 'google-price' | 'osm' | 'community-place' }) {
  const map = {
    google: { text: 'Data Google Maps', cls: 'bg-google-soft text-google' },
    mam: { text: 'Komunitas MAM!', cls: 'bg-primary-soft text-text' },
    delivery: { text: 'Platform pesan-antar', cls: 'bg-secondary-soft text-text' },
    'community-price': { text: 'Harga dilaporkan pengguna MAM!', cls: 'bg-primary-soft text-text' },
    'google-price': { text: 'Rentang harga dari Google Maps', cls: 'bg-google-soft text-google' },
    osm: { text: 'Data OpenStreetMap', cls: 'bg-surface-muted text-text' },
    'community-place': { text: 'Ditambahkan komunitas MAM!', cls: 'bg-secondary-soft text-text' },
  }[source];
  return <span className={`inline-flex items-center rounded-pill px-2 py-0.5 text-caption font-semibold ${map.cls}`}>{map.text}</span>;
}

// ───────────────── Ratings ─────────────────
export function Stars({ value, size = 14, label }: { value: number | null; size?: number; label?: string }) {
  const v = value ?? 0;
  return (
    <span className="inline-flex items-center" role="img" aria-label={label ?? (value === null ? 'Belum ada rating' : `Rating ${formatRating(value)} dari 5`)}>
      {[1, 2, 3, 4, 5].map((i) => {
        const fill = Math.max(0, Math.min(1, v - i + 1));
        return (
          <svg key={i} width={size} height={size} viewBox="0 0 20 20" aria-hidden>
            <defs>
              <linearGradient id={`s${i}-${Math.round(fill * 100)}`}>
                <stop offset={`${fill * 100}%`} stopColor="var(--mam-secondary)" />
                <stop offset={`${fill * 100}%`} stopColor="var(--mam-border)" />
              </linearGradient>
            </defs>
            <path d="M10 1.5l2.6 5.6 6 .7-4.5 4.1 1.2 6-5.3-3-5.3 3 1.2-6L1.4 7.8l6-.7z" fill={`url(#s${i}-${Math.round(fill * 100)})`} />
          </svg>
        );
      })}
    </span>
  );
}

export function RatingInput({ value, onChange, label }: { value: number; onChange: (v: number) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex gap-1">
      {[1, 2, 3, 4, 5].map((i) => (
        <button
          key={i}
          type="button"
          role="radio"
          aria-checked={value === i}
          aria-label={`${i} dari 5`}
          onClick={() => onChange(i)}
          className="rounded-md p-1 transition-transform hover:scale-110 active:scale-95"
        >
          <svg width="28" height="28" viewBox="0 0 20 20" aria-hidden>
            <path d="M10 1.5l2.6 5.6 6 .7-4.5 4.1 1.2 6-5.3-3-5.3 3 1.2-6L1.4 7.8l6-.7z" fill={i <= value ? 'var(--mam-secondary)' : 'var(--mam-border)'} />
          </svg>
        </button>
      ))}
    </div>
  );
}

// ───────────────── States ─────────────────
export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`skeleton ${className}`} aria-hidden />;
}

export function CardSkeleton() {
  return (
    <div className="card flex gap-3 p-3" aria-hidden>
      <Skeleton className="h-20 w-20 shrink-0" />
      <div className="flex-1 space-y-2 py-1">
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-3 w-1/2" />
        <Skeleton className="h-3 w-1/3" />
      </div>
    </div>
  );
}

export function EmptyState({ title, body, action, illustration }: { title: string; body?: string; action?: ReactNode; illustration?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center">
      {illustration ?? <EmptyPlateIllustration className="mb-4 h-28 w-36" />}
      <h3 className="text-h3 font-bold">{title}</h3>
      {body && <p className="mt-1 max-w-sm text-small text-text-muted">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="card flex flex-col items-center gap-2 border-danger-soft p-6 text-center">
      <p className="font-semibold">Ups, ada yang tidak beres.</p>
      <p className="text-small text-text-muted">{message ?? 'Coba lagi sebentar lagi.'}</p>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          Coba lagi
        </Button>
      )}
    </div>
  );
}

export function ProviderNotice({ message }: { message: string }) {
  return (
    <div role="status" className="flex items-start gap-2 rounded-md bg-secondary-soft px-3 py-2 text-small">
      <span aria-hidden>ℹ️</span>
      <span>{message}</span>
    </div>
  );
}

export function Avatar({ src, name, size = 36 }: { src: string | null; name: string; size?: number }) {
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" width={size} height={size} referrerPolicy="no-referrer" className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />
  ) : (
    <span aria-hidden className="inline-flex shrink-0 items-center justify-center rounded-full bg-primary-soft font-bold text-text" style={{ width: size, height: size, fontSize: size * 0.4 }}>
      {name.trim().charAt(0).toUpperCase() || '?'}
    </span>
  );
}

export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="max-h-[90vh] w-full animate-pop-in overflow-y-auto rounded-t-xl bg-surface p-5 shadow-raised sm:max-w-md sm:rounded-xl"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === 'Escape' && onClose()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-h3 font-bold">{title}</h2>
          <button onClick={onClose} aria-label="Tutup" className="rounded-full p-2 hover:bg-surface-muted">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function SectionHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <div>
        <h2 className="text-h2 font-extrabold">{title}</h2>
        {subtitle && <p className="text-small text-text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
