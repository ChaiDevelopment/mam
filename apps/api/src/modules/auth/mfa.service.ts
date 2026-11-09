import { HttpException, HttpStatus, Injectable, UnauthorizedException } from '@nestjs/common';
import { createHash, randomInt, randomUUID, timingSafeEqual } from 'crypto';
import { env } from '../../config/env';
import { CacheService } from '../../common/cache.service';
import { MailService, maskEmail, renderMail } from '../../common/mail.service';

export type SessionClientName = 'WEB' | 'ADMIN' | 'ANDROID';

interface Challenge {
  userId: string;
  email: string;
  client: SessionClientName;
  codeHash: string;
  attempts: number;
  sentAt: number;
}

export interface MfaChallengeResponse {
  mfaRequired: true;
  challengeId: string;
  /** Masked address the code was sent to, e.g. "mu***@gmail.com". */
  emailHint: string;
  expiresIn: number;
  /** DEVELOPMENT ONLY (no SMTP configured, DEV_LOGIN enabled): the code, so local testing works without e-mail. */
  devCode?: string;
}

export const MFA_TTL_SECONDS = 10 * 60;
export const MFA_MAX_ATTEMPTS = 5;
export const MFA_RESEND_SECONDS = 30;

/**
 * E-mailed one-time codes as a second factor for staff password logins. Codes are 6 random digits, stored only as a
 * SHA-256 hash bound to the challenge id, valid 10 minutes, single use, max 5 attempts.
 */
@Injectable()
export class MfaService {
  constructor(
    private readonly cache: CacheService,
    private readonly mail: MailService,
  ) {}

  /** Staff (MODERATOR and above) must pass MFA for password logins unless disabled by configuration. */
  requiredFor(role: string): boolean {
    return env().STAFF_MFA_REQUIRED && role !== 'USER';
  }

  private hash(challengeId: string, code: string) {
    return createHash('sha256').update(`${challengeId}:${code}:${env().JWT_ACCESS_SECRET}`).digest('hex');
  }

  private exposeDevCode(): boolean {
    return !this.mail.configured && env().DEV_LOGIN_ENABLED && env().NODE_ENV !== 'production';
  }

  private async sendCode(email: string, code: string) {
    const { text, html } = renderMail('Kode masuk MAM!', [
      `Kode verifikasi kamu: ${code}`,
      'Kode berlaku 10 menit dan hanya bisa dipakai sekali. Jangan berikan kode ini kepada siapa pun, termasuk tim MAM!.',
      'Kalau kamu tidak sedang masuk ke MAM!, abaikan email ini dan segera ganti kata sandimu.',
    ]);
    await this.mail.send({ to: email, subject: `${code} adalah kode masuk MAM! kamu`, text, html });
  }

  async start(user: { id: string; email: string }, client: SessionClientName): Promise<MfaChallengeResponse> {
    const challengeId = randomUUID();
    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    const c: Challenge = { userId: user.id, email: user.email, client, codeHash: this.hash(challengeId, code), attempts: 0, sentAt: Date.now() };
    await this.cache.set(`mfa:${challengeId}`, c, MFA_TTL_SECONDS);
    await this.sendCode(user.email, code);
    return { mfaRequired: true, challengeId, emailHint: maskEmail(user.email), expiresIn: MFA_TTL_SECONDS, ...(this.exposeDevCode() ? { devCode: code } : {}) };
  }

  async resend(challengeId: string): Promise<MfaChallengeResponse> {
    const key = `mfa:${challengeId}`;
    const c = await this.cache.get<Challenge>(key);
    if (!c) throw new UnauthorizedException('Sesi verifikasi kedaluwarsa. Silakan masuk ulang.');
    const wait = Math.ceil((c.sentAt + MFA_RESEND_SECONDS * 1000 - Date.now()) / 1000);
    if (wait > 0) throw new HttpException(`Tunggu ${wait} detik sebelum mengirim ulang kode.`, HttpStatus.TOO_MANY_REQUESTS);
    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    await this.cache.set(key, { ...c, codeHash: this.hash(challengeId, code), sentAt: Date.now() }, MFA_TTL_SECONDS);
    await this.sendCode(c.email, code);
    return { mfaRequired: true, challengeId, emailHint: maskEmail(c.email), expiresIn: MFA_TTL_SECONDS, ...(this.exposeDevCode() ? { devCode: code } : {}) };
  }

  /** Returns the user/client on success; the challenge is consumed. */
  async verify(challengeId: string, code: string): Promise<{ userId: string; client: SessionClientName }> {
    const key = `mfa:${challengeId}`;
    const c = await this.cache.get<Challenge>(key);
    if (!c) throw new UnauthorizedException('Kode kedaluwarsa. Silakan masuk ulang.');
    if (c.attempts >= MFA_MAX_ATTEMPTS) {
      await this.cache.del(key);
      throw new HttpException('Terlalu banyak kode salah. Silakan masuk ulang.', HttpStatus.TOO_MANY_REQUESTS);
    }
    const expected = Buffer.from(c.codeHash, 'hex');
    const given = Buffer.from(this.hash(challengeId, code.trim()), 'hex');
    if (!timingSafeEqual(expected, given)) {
      await this.cache.set(key, { ...c, attempts: c.attempts + 1 }, MFA_TTL_SECONDS);
      throw new UnauthorizedException(`Kode salah. Sisa percobaan: ${MFA_MAX_ATTEMPTS - c.attempts - 1}.`);
    }
    await this.cache.del(key);
    return { userId: c.userId, client: c.client };
  }
}
