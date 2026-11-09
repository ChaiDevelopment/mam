'use client';

import { useQuery } from '@tanstack/react-query';
import { ApiError, type MfaChallenge } from '@mam/api-client';
import { Suspense, useState, type FormEvent } from 'react';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui';
import { api } from '@/lib/api';

const ERR: Record<string, string> = {
  not_staff: 'Akun ini bukan akun staf MAM!.',
  invalid_state: 'Sesi login tidak valid. Coba lagi.',
  login_failed: 'Login gagal.',
  account_unavailable: 'Akun ditangguhkan atau dihapus.',
  google_denied: 'Login dibatalkan.',
};

function Inner() {
  const params = useSearchParams();
  const next = /^\/(?!\/)/.test(params.get('next') ?? '') ? params.get('next')! : '/';
  const err = params.get('error');
  const providers = useQuery({ queryKey: ['providers'], queryFn: () => api.request<{ google: boolean; password: boolean; devLogin: boolean }>('GET', '/auth/providers') });
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [demoEmail, setDemoEmail] = useState('superadmin@mam.local');
  const [mfa, setMfa] = useState<MfaChallenge | null>(null);
  const [code, setCode] = useState('');

  async function verify(e: FormEvent) {
    e.preventDefault();
    if (!mfa) return;
    setError(null);
    if (!/^\d{6}$/.test(code)) return setError('Masukkan 6 angka dari email.');
    setBusy(true);
    try {
      await api.auth.mfaVerify({ challengeId: mfa.challengeId, code });
      window.location.href = next;
    } catch (x) {
      setError(x instanceof ApiError ? x.message : 'Verifikasi gagal.');
      setBusy(false);
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email.trim() || !password) return setError('Isi email dan kata sandi.');
    setBusy(true);
    try {
      const r = await api.auth.login({ email, password, client: 'ADMIN' });
      if (r.mfaRequired) {
        setMfa(r);
        setCode('');
        setBusy(false);
        return;
      }
      window.location.href = next;
    } catch (x) {
      setError(x instanceof ApiError ? (x.isNetwork ? 'Server API tidak dapat dihubungi.' : x.message) : 'Login gagal.');
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto mt-20 max-w-sm rounded-lg border border-border bg-surface p-6 shadow-card">
      <h1 className="text-center text-h2 font-extrabold">
        MAM<span className="text-accent">!</span> Admin
      </h1>
      <p className="mt-1 text-center text-small text-text-muted">Khusus moderator dan admin.</p>
      {err && (
        <p role="alert" className="mt-3 rounded-md bg-danger-soft p-2 text-small">
          {ERR[err] ?? 'Login gagal.'}
        </p>
      )}
      {mfa ? (
        <form onSubmit={verify} className="mt-5 space-y-3" noValidate>
          <p className="rounded-md bg-secondary-soft p-2 text-small">
            Kode 6 angka sudah dikirim ke <strong>{mfa.emailHint}</strong> (berlaku 10 menit).
            {mfa.devCode && (
              <span className="mt-1 block text-caption">
                Mode pengembangan, SMTP belum diatur: kode = <code data-testid="dev-code">{mfa.devCode}</code>
              </span>
            )}
          </p>
          <label className="block text-small font-semibold">
            Kode verifikasi
            <input
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              className="mt-1 h-11 w-full rounded-md border border-border bg-surface px-3 text-center text-h3 tracking-[0.5em]"
            />
          </label>
          {error && (
            <p role="alert" className="rounded-md bg-danger-soft p-2 text-small font-semibold">
              {error}
            </p>
          )}
          <Button type="submit" loading={busy} className="w-full">
            Verifikasi
          </Button>
          <div className="flex justify-between text-caption">
            <button
              type="button"
              className="underline"
              onClick={async () => {
                setError(null);
                try {
                  setMfa(await api.auth.mfaResend(mfa.challengeId));
                } catch (x) {
                  setError(x instanceof ApiError ? x.message : 'Gagal mengirim ulang.');
                }
              }}
            >
              Kirim ulang kode
            </button>
            <button type="button" className="text-text-muted underline" onClick={() => (setMfa(null), setError(null))}>
              Batal
            </button>
          </div>
        </form>
      ) : (
      <form onSubmit={submit} className="mt-5 space-y-3" noValidate>
        <label className="block text-small font-semibold">
          Email
          <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 h-10 w-full rounded-md border border-border bg-surface px-3" />
        </label>
        <label className="block text-small font-semibold">
          Kata sandi
          <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1 h-10 w-full rounded-md border border-border bg-surface px-3" />
        </label>
        {error && (
          <p role="alert" className="rounded-md bg-danger-soft p-2 text-small font-semibold">
            {error}
          </p>
        )}
        <Button type="submit" loading={busy} className="w-full">
          Masuk
        </Button>
      </form>
      )}
      {providers.data?.google && (
        <a href={api.auth.googleStartUrl('admin', next)} className="mt-3 inline-flex h-10 w-full items-center justify-center rounded-md border border-border font-semibold hover:bg-surface-muted">
          Masuk dengan Google
        </a>
      )}
      {providers.data?.devLogin && (
        <details className="mt-6 border-t border-border pt-4 text-left">
          <summary className="cursor-pointer text-caption font-bold">Akun demo (mode pengembangan)</summary>
          <p className="mt-2 text-caption text-text-muted">
            superadmin@mam.local, admin@mam.local, moderator@mam.local — kata sandi <code>mam12345</code>. Atau masuk cepat:
          </p>
          <div className="mt-2 flex gap-2">
            <label htmlFor="e" className="sr-only">
              Email demo
            </label>
            <input id="e" value={demoEmail} onChange={(e) => setDemoEmail(e.target.value)} className="h-9 flex-1 rounded-md border border-border px-2 text-small" />
            <Button
              type="button"
              loading={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await api.request('POST', '/auth/dev-login', { email: demoEmail, client: 'ADMIN' });
                  window.location.href = next;
                } finally {
                  setBusy(false);
                }
              }}
            >
              Demo
            </Button>
          </div>
        </details>
      )}
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <Inner />
    </Suspense>
  );
}
