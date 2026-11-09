import { BadRequestException, ForbiddenException, HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import type { EmailTokenPurpose, User } from '@prisma/client';
import { createHash, randomBytes } from 'crypto';
import { env } from '../../config/env';
import { CacheService } from '../../common/cache.service';
import { MailService, renderMail } from '../../common/mail.service';
import { PrismaService } from '../../common/prisma.service';
import { hashPassword } from './password';
import { TokenService } from './token.service';

export const VERIFY_TTL_HOURS = 48;
export const RESET_TTL_MINUTES = 60;
const sha = (t: string) => createHash('sha256').update(t).digest('hex');

/**
 * Single-use e-mail links: address verification and password reset.
 * Raw tokens (32 random bytes, base64url) exist only in the e-mail; the database keeps their SHA-256.
 */
@Injectable()
export class EmailLinksService {
  private readonly logger = new Logger('EmailLinks');

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly cache: CacheService,
    private readonly tokens: TokenService,
  ) {}

  /** Creates a new link token and invalidates older unused ones of the same purpose. */
  async issue(userId: string, purpose: EmailTokenPurpose, ttlMs: number): Promise<string> {
    const raw = randomBytes(32).toString('base64url');
    await this.prisma.$transaction([
      this.prisma.emailToken.updateMany({ where: { userId, purpose, usedAt: null }, data: { usedAt: new Date() } }),
      this.prisma.emailToken.create({ data: { userId, purpose, tokenHash: sha(raw), expiresAt: new Date(Date.now() + ttlMs) } }),
    ]);
    return raw;
  }

  /** Marks the token used and returns its user id; generic error when unknown, used or expired. */
  async consume(raw: string, purpose: EmailTokenPurpose): Promise<string> {
    const now = new Date();
    const row = await this.prisma.emailToken.findUnique({ where: { tokenHash: sha(raw) } });
    if (!row || row.purpose !== purpose || row.usedAt || row.expiresAt < now) {
      throw new BadRequestException('Tautan tidak valid atau sudah kedaluwarsa. Minta tautan baru.');
    }
    const marked = await this.prisma.emailToken.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: now } });
    if (marked.count !== 1) throw new BadRequestException('Tautan tidak valid atau sudah kedaluwarsa. Minta tautan baru.');
    return row.userId;
  }

  private name(user: { profile?: { displayName: string } | null }) {
    return user.profile?.displayName || 'Sobat MAM!';
  }

  async sendVerification(user: User & { profile?: { displayName: string } | null }): Promise<void> {
    const token = await this.issue(user.id, 'VERIFY_EMAIL', VERIFY_TTL_HOURS * 3600_000);
    const link = `${env().WEB_PUBLIC_URL}/verifikasi-email?token=${token}`;
    const { text, html } = renderMail('Verifikasi email kamu', [
      `Halo ${this.name(user)},`,
      'Terima kasih sudah bergabung di MAM!. Buka tautan berikut untuk memverifikasi email kamu (berlaku 48 jam):',
      link,
      'Setelah terverifikasi kamu bisa menulis ulasan dan menambahkan tempat makan. Kalau kamu tidak merasa mendaftar, abaikan email ini.',
    ]);
    await this.mail.send({ to: user.email, subject: 'Verifikasi email MAM! kamu', text, html });
  }

  /** Resend for the logged-in user (max once per minute). */
  async resendVerification(userId: string): Promise<{ ok: true; alreadyVerified?: true }> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, include: { profile: { select: { displayName: true } } } });
    if (user.emailVerified) return { ok: true, alreadyVerified: true };
    const key = `verifymail:${userId}`;
    if (await this.cache.get(key)) throw new HttpException('Tunggu sebentar sebelum mengirim ulang email verifikasi.', HttpStatus.TOO_MANY_REQUESTS);
    await this.cache.set(key, 1, 60);
    await this.sendVerification(user);
    return { ok: true };
  }

  async verifyEmail(raw: string): Promise<{ ok: true; email: string }> {
    const userId = await this.consume(raw, 'VERIFY_EMAIL');
    const u = await this.prisma.user.update({ where: { id: userId }, data: { emailVerified: true } });
    return { ok: true, email: u.email };
  }

  /**
   * Always answers the same way (no account enumeration). Sends a reset link to active accounts, at most once per
   * minute per address.
   */
  async forgotPassword(email: string): Promise<{ ok: true }> {
    const key = `resetmail:${email}`;
    if (await this.cache.get(key)) return { ok: true };
    await this.cache.set(key, 1, 60);
    const user = await this.prisma.user.findUnique({ where: { email }, include: { profile: { select: { displayName: true } } } });
    if (!user || user.status !== 'ACTIVE') return { ok: true };
    const token = await this.issue(user.id, 'RESET_PASSWORD', RESET_TTL_MINUTES * 60_000);
    const link = `${env().WEB_PUBLIC_URL}/atur-ulang-sandi?token=${token}`;
    const { text, html } = renderMail('Atur ulang kata sandi', [
      `Halo ${this.name(user)},`,
      'Kami menerima permintaan untuk mengatur ulang kata sandi akun MAM! kamu. Buka tautan berikut (berlaku 1 jam, sekali pakai):',
      link,
      'Kalau kamu tidak meminta ini, abaikan email ini — kata sandimu tidak berubah.',
    ]);
    try {
      await this.mail.send({ to: user.email, subject: 'Atur ulang kata sandi MAM!', text, html });
    } catch (e) {
      this.logger.error(`reset mail failed: ${(e as Error).message}`);
    }
    return { ok: true };
  }

  /** Sets the new password, confirms the e-mail (the link proved ownership) and signs out every device. */
  async resetPassword(raw: string, newPassword: string): Promise<{ ok: true }> {
    const userId = await this.consume(raw, 'RESET_PASSWORD');
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.status !== 'ACTIVE') throw new ForbiddenException('Akun ini tidak aktif.');
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(newPassword), passwordUpdatedAt: new Date(), emailVerified: true } });
    await this.tokens.revokeAllForUser(userId);
    await this.cache.del(`loginfail:${user.email}`);
    return { ok: true };
  }

  /** Throws when a regular user has not verified their e-mail yet (staff are exempt). */
  async requireVerified(userId: string): Promise<void> {
    const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { emailVerified: true, role: true } });
    if (u && !u.emailVerified && u.role === 'USER') {
      throw new ForbiddenException({ message: 'Verifikasi email kamu dulu sebelum menulis ulasan atau menambahkan tempat. Cek email dari MAM!, atau kirim ulang dari halaman Profil.', details: { code: 'EMAIL_NOT_VERIFIED' } });
    }
  }
}
