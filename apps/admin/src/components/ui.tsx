'use client';

import { ApiError } from '@mam/api-client';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

export function Button({ variant = 'primary', loading, className = '', children, disabled, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'outline' | 'danger' | 'ghost'; loading?: boolean }) {
  const v = {
    primary: 'bg-primary text-on-primary hover:bg-primary-dark',
    outline: 'border border-border bg-surface hover:bg-surface-muted',
    danger: 'bg-danger text-white hover:opacity-90',
    ghost: 'hover:bg-surface-muted',
  }[variant];
  return (
    <button disabled={disabled || loading} aria-busy={loading || undefined} className={`inline-flex h-9 items-center justify-center gap-2 rounded-md px-3 text-small font-semibold disabled:opacity-50 ${v} ${className}`} {...rest}>
      {loading && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />}
      {children}
    </button>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-h1 font-extrabold">{title}</h1>
        {subtitle && <p className="text-small text-text-muted">{subtitle}</p>}
      </div>
      {actions}
    </div>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-lg border border-border bg-surface p-4 shadow-card ${className}`}>{children}</div>;
}

export function Loading() {
  return (
    <div className="space-y-2" aria-busy="true" aria-label="Memuat">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-12 animate-pulse rounded-md bg-surface-muted" />
      ))}
    </div>
  );
}

export function ErrorBox({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <div role="alert" className="rounded-md border border-danger bg-danger-soft p-4 text-small">
      {error instanceof ApiError ? error.message : 'Gagal memuat data.'}
      {onRetry && <button className="ml-2 font-semibold underline" onClick={onRetry}>Coba lagi</button>}
    </div>
  );
}

export function Empty({ text }: { text: string }) {
  return <p className="rounded-md border border-dashed border-border p-8 text-center text-small text-text-muted">{text}</p>;
}

export function StatusPill({ status }: { status: string }) {
  const cls: Record<string, string> = {
    PUBLISHED: 'bg-success-soft text-success',
    ACTIVE: 'bg-success-soft text-success',
    PENDING: 'bg-secondary-soft',
    OPEN: 'bg-secondary-soft',
    HIDDEN: 'bg-surface-muted',
    REJECTED: 'bg-danger-soft text-danger',
    SUSPENDED: 'bg-danger-soft text-danger',
    DELETED: 'bg-surface-muted text-text-muted',
    MERGED: 'bg-surface-muted text-text-muted',
  };
  return <span className={`inline-block rounded-pill px-2 py-0.5 text-caption font-bold ${cls[status] ?? 'bg-surface-muted'}`}>{status}</span>;
}

export function Pager({ page, hasMore, total, onPage }: { page: number; hasMore: boolean; total: number; onPage: (p: number) => void }) {
  return (
    <div className="mt-4 flex items-center justify-between text-small">
      <span className="text-text-muted">{total} data</span>
      <div className="flex gap-2">
        <Button variant="outline" disabled={page <= 1} onClick={() => onPage(page - 1)}>← Sebelumnya</Button>
        <Button variant="outline" disabled={!hasMore} onClick={() => onPage(page + 1)}>Berikutnya →</Button>
      </div>
    </div>
  );
}

export function Dialog({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: ReactNode }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={title} className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg bg-surface p-5 shadow-raised" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-h3 font-bold">{title}</h2>
          <button onClick={onClose} aria-label="Tutup" className="rounded p-1 hover:bg-surface-muted">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Every admin mutation requires a written reason (stored in the audit log). */
export function ReasonField({ value, onChange, label = 'Alasan (wajib, dicatat di log audit)' }: { value: string; onChange: (v: string) => void; label?: string }) {
  return (
    <label className="block text-small font-semibold">
      {label}
      <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={3} maxLength={1000} className="mt-1 w-full rounded-md border border-border bg-surface p-2" />
      {value.trim().length > 0 && value.trim().length < 5 && <span className="text-caption text-danger">Minimal 5 karakter.</span>}
    </label>
  );
}
