'use client';

import { useQueryClient } from '@tanstack/react-query';
import { ApiError } from '@mam/api-client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';
import { BowlIllustration } from '@/components/illustrations';
import { LinkButton } from '@/components/ui';
import { api } from '@/lib/api';

function Inner() {
  const token = useSearchParams().get('token') ?? '';
  const qc = useQueryClient();
  const [state, setState] = useState<{ status: 'loading' | 'ok' | 'error'; message?: string }>({ status: 'loading' });
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return; // single-use token: never submit twice (React strict mode runs effects twice)
    started.current = true;
    if (!token) return setState({ status: 'error', message: 'Tautan verifikasi tidak lengkap.' });
    api.auth
      .verifyEmail(token)
      .then((r) => {
        setState({ status: 'ok', message: r.email });
        void qc.invalidateQueries({ queryKey: ['me'] });
      })
      .catch((e) => setState({ status: 'error', message: e instanceof ApiError ? e.message : 'Verifikasi gagal. Coba lagi.' }));
  }, [token, qc]);

  return (
    <div className="container-page flex max-w-md flex-col items-center pt-12 text-center">
      <BowlIllustration className="h-28 w-36" />
      {state.status === 'loading' && <p className="mt-4 text-body" aria-live="polite">Memverifikasi email…</p>}
      {state.status === 'ok' && (
        <>
          <h1 className="mt-4 text-h1 font-extrabold">Email terverifikasi ✅</h1>
          <p className="mt-2 text-small text-text-muted">{state.message} sudah terverifikasi. Sekarang kamu bisa menulis ulasan dan menambahkan tempat makan.</p>
          <LinkButton href="/jelajah" className="mt-6">
            Mulai menjelajah
          </LinkButton>
        </>
      )}
      {state.status === 'error' && (
        <>
          <h1 className="mt-4 text-h1 font-extrabold">Tautan tidak berlaku</h1>
          <p role="alert" className="mt-2 text-small text-text-muted">
            {state.message}
          </p>
          <p className="mt-4 text-small">
            Masuk lalu buka{' '}
            <Link href="/profil" className="tap font-bold underline">
              Profil
            </Link>{' '}
            untuk mengirim ulang email verifikasi.
          </p>
        </>
      )}
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense>
      <Inner />
    </Suspense>
  );
}
