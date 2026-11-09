'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { ApiError, type MfaChallenge } from '@mam/api-client';
import { loginSchema, registerSchema } from '@mam/validation';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { BowlIllustration } from '@/components/illustrations';
import { useAuth, useToast } from '@/components/providers';
import { Button, ProviderNotice } from '@/components/ui';
import { api } from '@/lib/api';

const ERRORS: Record<string, string> = {
  google_denied: 'Login dibatalkan.',
  invalid_state: 'Sesi login kedaluwarsa atau tidak valid. Silakan coba lagi.',
  login_failed: 'Login gagal. Silakan coba lagi.',
  account_unavailable: 'Akun ini ditangguhkan atau telah dihapus.',
};

const loginForm = loginSchema.omit({ client: true });
const registerForm = registerSchema.omit({ client: true });
type LoginValues = z.infer<typeof loginForm>;
type RegisterValues = z.infer<typeof registerForm>;

const inputCls = 'mt-1 h-11 w-full rounded-md border border-border bg-surface px-3 outline-none focus:border-primary';

/** Thrown internally when the password was right but a staff account still needs the e-mailed code. */
const MFA_PENDING = Symbol('mfa');

function safeNext(n: string | null) {
  return n && /^\/(?!\/)/.test(n) ? n : '/';
}

function FieldError({ message }: { message?: string }) {
  return message ? <span className="mt-1 block text-caption text-danger">{message}</span> : null;
}

function LoginInner() {
  const params = useSearchParams();
  const next = safeNext(params.get('next'));
  const error = params.get('error');
  const { me, refresh } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const providers = useQuery({ queryKey: ['auth-providers'], queryFn: () => api.auth.providers() });
  const [mode, setMode] = useState<'login' | 'register'>(params.get('daftar') !== null ? 'register' : 'login');
  const [formError, setFormError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [demoEmail, setDemoEmail] = useState('budi@mam.local');
  const [busy, setBusy] = useState(false);
  const [mfa, setMfa] = useState<MfaChallenge | null>(null);
  const [code, setCode] = useState('');

  useEffect(() => {
    if (me) router.replace(next);
  }, [me, next, router]);

  const lf = useForm<LoginValues>({ resolver: zodResolver(loginForm), defaultValues: { email: '', password: '' } });
  const rf = useForm<RegisterValues>({ resolver: zodResolver(registerForm), defaultValues: { email: '', password: '', displayName: '' } });

  async function finish(fn: () => Promise<unknown>, success: string) {
    setFormError(null);
    try {
      await fn();
      await refresh();
      toast('success', success);
    } catch (e) {
      if (e === MFA_PENDING) return;
      setFormError(e instanceof ApiError ? (e.isNetwork ? 'Tidak dapat terhubung ke server. Periksa koneksi lalu coba lagi.' : e.message) : 'Terjadi kesalahan. Coba lagi.');
    }
  }

  async function devLogin() {
    setBusy(true);
    try {
      await api.request('POST', '/auth/dev-login', { email: demoEmail });
      await refresh();
      toast('success', 'Masuk (mode pengembangan)');
    } catch {
      toast('error', 'Login demo gagal.');
    } finally {
      setBusy(false);
    }
  }

  const google = providers.data?.google;

  return (
    <div className="container-page flex max-w-md flex-col items-center pt-10">
      <BowlIllustration className="h-28 w-36" />
      <h1 className="mt-2 text-center text-h1 font-extrabold">{mode === 'login' ? 'Masuk ke MAM!' : 'Daftar di MAM!'}</h1>
      <p className="mt-1 text-center text-small text-text-muted">Simpan favorit, buat koleksi, dan tulis ulasan untuk komunitas.</p>
      {error && (
        <div className="mt-4 w-full">
          <ProviderNotice message={ERRORS[error] ?? 'Login gagal.'} />
        </div>
      )}

      {mfa ? (
        <form
          className="mt-6 w-full space-y-4"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            if (!/^\d{6}$/.test(code.trim())) return setFormError('Masukkan 6 angka dari email.');
            void finish(() => api.auth.mfaVerify({ challengeId: mfa.challengeId, code: code.trim() }), 'Verifikasi berhasil. Selamat datang!');
          }}
        >
          <div className="rounded-lg bg-secondary-soft p-3 text-small">
            Untuk keamanan akun staf, kami mengirim <strong>kode 6 angka</strong> ke <strong>{mfa.emailHint}</strong>. Kode berlaku 10 menit.
            {mfa.devCode && (
              <span className="mt-1 block text-caption text-text-muted">
                Mode pengembangan (SMTP belum diatur): kode = <code data-testid="dev-code">{mfa.devCode}</code>
              </span>
            )}
          </div>
          <label className="block text-small font-semibold">
            Kode verifikasi
            <input
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              className={`${inputCls} text-center text-h3 tracking-[0.5em]`}
              autoFocus
            />
          </label>
          {formError && (
            <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-small font-semibold">
              {formError}
            </p>
          )}
          <Button type="submit" size="lg" className="w-full">
            Verifikasi
          </Button>
          <div className="flex justify-between text-caption">
            <button
              type="button"
              className="font-semibold underline"
              onClick={async () => {
                setFormError(null);
                try {
                  setMfa(await api.auth.mfaResend(mfa.challengeId));
                  toast('success', 'Kode baru sudah dikirim.');
                } catch (x) {
                  setFormError(x instanceof ApiError ? x.message : 'Gagal mengirim ulang kode.');
                }
              }}
            >
              Kirim ulang kode
            </button>
            <button type="button" className="text-text-muted underline" onClick={() => (setMfa(null), setFormError(null))}>
              Batal
            </button>
          </div>
        </form>
      ) : (
        <>
      <div role="tablist" aria-label="Masuk atau daftar" className="mt-6 flex w-full rounded-pill border border-border bg-surface p-1">
        {(['login', 'register'] as const).map((m) => (
          <button
            key={m}
            role="tab"
            type="button"
            aria-selected={mode === m}
            onClick={() => (setMode(m), setFormError(null))}
            className={`flex-1 rounded-pill py-2 text-small font-bold ${mode === m ? 'bg-primary text-on-primary' : 'text-text-muted'}`}
          >
            {m === 'login' ? 'Masuk' : 'Daftar'}
          </button>
        ))}
      </div>

      {mode === 'login' ? (
        <form
          className="mt-5 w-full space-y-4"
          noValidate
          onSubmit={lf.handleSubmit((v) =>
            finish(async () => {
              const r = await api.auth.login({ ...v, client: 'WEB' });
              if (r.mfaRequired) {
                setMfa(r);
                setCode('');
                throw MFA_PENDING;
              }
            }, 'Selamat datang kembali!'),
          )}
        >
          <label className="block text-small font-semibold">
            Email
            <input type="email" autoComplete="email" inputMode="email" {...lf.register('email')} className={inputCls} placeholder="nama@email.com" aria-invalid={!!lf.formState.errors.email} />
            <FieldError message={lf.formState.errors.email?.message} />
          </label>
          <label className="block text-small font-semibold">
            Kata sandi
            <input type={showPassword ? 'text' : 'password'} autoComplete="current-password" {...lf.register('password')} className={inputCls} aria-invalid={!!lf.formState.errors.password} />
            <FieldError message={lf.formState.errors.password?.message} />
          </label>
          <div className="flex items-center justify-between gap-2">
            <label className="flex items-center gap-2 text-caption text-text-muted">
              <input type="checkbox" checked={showPassword} onChange={(e) => setShowPassword(e.target.checked)} className="h-4 w-4 accent-primary" /> Tampilkan kata sandi
            </label>
            <Link href="/lupa-sandi" className="tap text-caption font-semibold underline">
              Lupa kata sandi?
            </Link>
          </div>
          {formError && (
            <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-small font-semibold">
              {formError}
            </p>
          )}
          <Button type="submit" size="lg" className="w-full" loading={lf.formState.isSubmitting}>
            Masuk
          </Button>
          <p className="text-center text-caption text-text-muted">
            Belum punya akun?{' '}
            <button type="button" className="tap font-bold text-text underline" onClick={() => (setMode('register'), setFormError(null))}>
              Daftar gratis
            </button>
          </p>
        </form>
      ) : (
        <form className="mt-5 w-full space-y-4" noValidate onSubmit={rf.handleSubmit((v) => finish(() => api.auth.register({ ...v, client: 'WEB' }), 'Akun berhasil dibuat. Selamat datang di MAM!'))}>
          <label className="block text-small font-semibold">
            Nama tampilan
            <input autoComplete="name" {...rf.register('displayName')} className={inputCls} placeholder="mis. Ani Pecinta Bakso" maxLength={60} aria-invalid={!!rf.formState.errors.displayName} />
            <FieldError message={rf.formState.errors.displayName?.message} />
          </label>
          <label className="block text-small font-semibold">
            Email
            <input type="email" autoComplete="email" inputMode="email" {...rf.register('email')} className={inputCls} placeholder="nama@email.com" aria-invalid={!!rf.formState.errors.email} />
            <FieldError message={rf.formState.errors.email?.message} />
          </label>
          <label className="block text-small font-semibold">
            Kata sandi (minimal 8 karakter)
            <input type={showPassword ? 'text' : 'password'} autoComplete="new-password" {...rf.register('password')} className={inputCls} aria-invalid={!!rf.formState.errors.password} />
            <FieldError message={rf.formState.errors.password?.message} />
          </label>
          <label className="flex items-center gap-2 text-caption text-text-muted">
            <input type="checkbox" checked={showPassword} onChange={(e) => setShowPassword(e.target.checked)} className="h-4 w-4 accent-primary" /> Tampilkan kata sandi
          </label>
          {formError && (
            <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-small font-semibold">
              {formError}
            </p>
          )}
          <Button type="submit" size="lg" className="w-full" loading={rf.formState.isSubmitting}>
            Buat akun
          </Button>
          <p className="text-center text-caption text-text-muted">
            Dengan mendaftar kamu menyetujui <a href="/ketentuan" className="underline">Ketentuan</a> dan <a href="/privasi" className="underline">Kebijakan Privasi</a> MAM!.
          </p>
        </form>
      )}

        </>
      )}

      {google && !mfa && (
        <>
          <div className="my-5 flex w-full items-center gap-3 text-caption text-text-muted">
            <span className="h-px flex-1 bg-border" /> atau <span className="h-px flex-1 bg-border" />
          </div>
          <a
            href={api.auth.googleStartUrl('web', next)}
            className="inline-flex h-12 w-full items-center justify-center gap-3 rounded-pill border border-border bg-surface font-semibold shadow-card hover:shadow-raised"
          >
            <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden>
              <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
              <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
              <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
              <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C36.9 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
            </svg>
            Lanjutkan dengan Google
          </a>
        </>
      )}

      {providers.data?.devLogin && (
        <details className="card mt-8 w-full p-4 text-left">
          <summary className="cursor-pointer text-small font-bold">Akun demo (mode pengembangan)</summary>
          <p className="mt-2 text-caption text-text-muted">
            Akun demo: budi@mam.local, sari@mam.local, moderator@mam.local, admin@mam.local, superadmin@mam.local — kata sandi <code>mam12345</code>. Atau masuk
            cepat tanpa kata sandi:
          </p>
          <div className="mt-2 flex gap-2">
            <label htmlFor="dev-email" className="sr-only">
              Email demo
            </label>
            <input id="dev-email" value={demoEmail} onChange={(e) => setDemoEmail(e.target.value)} className="h-10 flex-1 rounded-md border border-border px-3 text-small" />
            <Button size="sm" variant="secondary" onClick={devLogin} loading={busy}>
              Masuk demo
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
      <LoginInner />
    </Suspense>
  );
}
