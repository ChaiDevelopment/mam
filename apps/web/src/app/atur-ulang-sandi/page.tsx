'use client';

import { ApiError } from '@mam/api-client';
import { PASSWORD_MIN_LENGTH } from '@mam/validation';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui';
import { api } from '@/lib/api';

const inputCls = 'mt-1 h-11 w-full rounded-md border border-border bg-surface px-3 outline-none focus:border-primary';

function Inner() {
  const token = useSearchParams().get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < PASSWORD_MIN_LENGTH) return setError(`Kata sandi minimal ${PASSWORD_MIN_LENGTH} karakter.`);
    if (password !== confirm) return setError('Konfirmasi kata sandi tidak sama.');
    setBusy(true);
    try {
      await api.auth.resetPassword(token, password);
      setDone(true);
    } catch (x) {
      setError(x instanceof ApiError ? x.message : 'Kata sandi belum bisa disimpan.');
    } finally {
      setBusy(false);
    }
  }

  if (!token) {
    return (
      <div className="container-page max-w-md pt-10">
        <h1 className="text-h1 font-extrabold">Tautan tidak lengkap</h1>
        <p className="mt-2 text-small text-text-muted">
          Buka tautan dari email MAM! kamu, atau{' '}
          <Link href="/lupa-sandi" className="tap font-bold underline">
            minta tautan baru
          </Link>
          .
        </p>
      </div>
    );
  }

  return (
    <div className="container-page max-w-md pt-10">
      <h1 className="text-h1 font-extrabold">Buat kata sandi baru</h1>
      {done ? (
        <div role="status" className="mt-4 rounded-lg bg-primary-soft p-4 text-small">
          Kata sandi berhasil diubah. Demi keamanan, kamu sudah dikeluarkan dari semua perangkat.
          <p className="mt-3">
            <Link href="/masuk" className="tap font-bold underline">
              Masuk dengan kata sandi baru
            </Link>
          </p>
        </div>
      ) : (
        <form onSubmit={submit} className="mt-4 space-y-4" noValidate>
          <label className="block text-small font-semibold">
            Kata sandi baru (minimal {PASSWORD_MIN_LENGTH} karakter)
            <input type={show ? 'text' : 'password'} name="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputCls} />
          </label>
          <label className="block text-small font-semibold">
            Ulangi kata sandi baru
            <input type={show ? 'text' : 'password'} name="confirm" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className={inputCls} />
          </label>
          <label className="flex items-center gap-2 text-caption text-text-muted">
            <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} className="h-4 w-4 accent-primary" /> Tampilkan kata sandi
          </label>
          {error && (
            <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-small font-semibold">
              {error}
              {/kedaluwarsa|tidak valid/i.test(error) && (
                <>
                  {' '}
                  <Link href="/lupa-sandi" className="underline">
                    Minta tautan baru
                  </Link>
                </>
              )}
            </p>
          )}
          <Button type="submit" size="lg" className="w-full" loading={busy}>
            Simpan kata sandi
          </Button>
        </form>
      )}
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <Inner />
    </Suspense>
  );
}
