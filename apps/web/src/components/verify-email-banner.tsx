'use client';

import { ApiError } from '@mam/api-client';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/lib/api';
import { useAuth, useToast } from './providers';

/** Shown to signed-in users whose e-mail is not verified yet (needed to write reviews and add places). */
export function VerifyEmailBanner() {
  const { me } = useAuth();
  const toast = useToast();
  const path = usePathname();
  const [busy, setBusy] = useState(false);
  if (!me || me.emailVerified || path.startsWith('/verifikasi-email')) return null;
  async function resend() {
    setBusy(true);
    try {
      const r = await api.auth.resendVerification();
      toast('success', r.alreadyVerified ? 'Email kamu sudah terverifikasi.' : `Email verifikasi dikirim ke ${me!.email}.`);
    } catch (e) {
      toast('error', e instanceof ApiError ? e.message : 'Gagal mengirim email verifikasi.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div role="status" className="border-b border-border bg-secondary-soft">
      <div className="container-page flex flex-wrap items-center justify-between gap-2 py-2 text-small">
        <span>
          📧 Verifikasi email <strong>{me.email}</strong> untuk menulis ulasan dan menambahkan tempat.
        </span>
        <button type="button" onClick={resend} disabled={busy} className="tap font-bold underline disabled:opacity-60">
          {busy ? 'Mengirim…' : 'Kirim ulang email'}
        </button>
      </div>
    </div>
  );
}
