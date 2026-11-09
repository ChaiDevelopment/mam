'use client';

import { ApiError } from '@mam/api-client';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui';
import { api } from '@/lib/api';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) return setError('Masukkan email yang valid.');
    setBusy(true);
    try {
      await api.auth.forgotPassword(email.trim());
      setSent(true);
    } catch (x) {
      setError(x instanceof ApiError ? (x.isNetwork ? 'Tidak dapat terhubung ke server.' : x.message) : 'Terjadi kesalahan. Coba lagi.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="container-page max-w-md pt-10">
      <h1 className="text-h1 font-extrabold">Lupa kata sandi</h1>
      {sent ? (
        <div role="status" className="mt-4 rounded-lg bg-primary-soft p-4 text-small">
          Kalau <strong>{email.trim()}</strong> terdaftar di MAM!, kami sudah mengirim tautan untuk mengatur ulang kata sandi. Tautan berlaku 1 jam. Cek juga folder
          spam.
          <p className="mt-3">
            <Link href="/masuk" className="tap font-bold underline">
              Kembali ke halaman masuk
            </Link>
          </p>
        </div>
      ) : (
        <form onSubmit={submit} className="mt-4 space-y-4" noValidate>
          <p className="text-small text-text-muted">Masukkan email akunmu. Kami akan mengirim tautan untuk membuat kata sandi baru.</p>
          <label className="block text-small font-semibold">
            Email
            <input
              type="email"
              name="email"
              autoComplete="email"
              inputMode="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 h-11 w-full rounded-md border border-border bg-surface px-3 outline-none focus:border-primary"
              placeholder="nama@email.com"
            />
          </label>
          {error && (
            <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-small font-semibold">
              {error}
            </p>
          )}
          <Button type="submit" size="lg" className="w-full" loading={busy}>
            Kirim tautan
          </Button>
          <p className="text-center text-caption">
            <Link href="/masuk" className="tap underline">
              Kembali ke halaman masuk
            </Link>
          </p>
        </form>
      )}
    </div>
  );
}
