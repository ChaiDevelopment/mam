import { Global, Injectable, Logger, Module } from '@nestjs/common';
import { mkdir, writeFile } from 'fs/promises';
import { createTransport, type Transporter } from 'nodemailer';
import path from 'path';
import { env } from '../config/env';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface SentMail extends MailMessage {
  /** 'smtp' = handed to the SMTP server; 'outbox' = written to MAIL_OUTBOX_DIR (no SMTP credentials). */
  via: 'smtp' | 'outbox';
  at: string;
}

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Wraps plain paragraphs into a small branded HTML e-mail. All dynamic values are HTML-escaped. */
export function renderMail(title: string, paragraphs: string[], footer = 'Email ini dikirim otomatis oleh MAM! — Discover. Review. Eat.'): { text: string; html: string } {
  const text = [title, '', ...paragraphs, '', '—', footer].join('\n');
  const html = `<!doctype html><html lang="id"><body style="margin:0;background:#FFF9F0;font-family:Arial,Helvetica,sans-serif;color:#252525">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px">
<table role="presentation" width="100%" style="max-width:520px;background:#ffffff;border-radius:16px;padding:24px">
<tr><td style="font-size:22px;font-weight:800">MAM<span style="color:#FF6B6B">!</span></td></tr>
<tr><td style="padding-top:12px;font-size:18px;font-weight:700">${escape(title)}</td></tr>
${paragraphs.map((p) => `<tr><td style="padding-top:12px;font-size:15px;line-height:1.5">${escape(p).replace(/\n/g, '<br>')}</td></tr>`).join('\n')}
<tr><td style="padding-top:24px;font-size:12px;color:#858585">${escape(footer)}</td></tr>
</table></td></tr></table></body></html>`;
  return { text, html };
}

/**
 * Outgoing e-mail. Uses SMTP when SMTP_USER/SMTP_PASS are set (Gmail: an App Password), otherwise writes the message
 * to MAIL_OUTBOX_DIR so development and tests work without credentials. Production refuses to start without SMTP.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger('Mail');
  private transporter: Transporter | null = null;
  /** Last messages (tests / development diagnostics). Never exposed over HTTP. */
  readonly recent: SentMail[] = [];

  get configured(): boolean {
    return !!(env().SMTP_USER && env().SMTP_PASS);
  }

  private transport(): Transporter {
    this.transporter ??= createTransport({
      host: env().SMTP_HOST,
      port: env().SMTP_PORT,
      secure: env().SMTP_PORT === 465,
      auth: { user: env().SMTP_USER, pass: env().SMTP_PASS },
    });
    return this.transporter;
  }

  async send(msg: MailMessage): Promise<SentMail> {
    const at = new Date().toISOString();
    if (this.configured) {
      await this.transport().sendMail({ from: env().MAIL_FROM || `MAM! <${env().SMTP_USER}>`, to: msg.to, subject: msg.subject, text: msg.text, html: msg.html });
      this.logger.log(`sent "${msg.subject}" to ${maskEmail(msg.to)}`);
      return this.remember({ ...msg, via: 'smtp', at });
    }
    const dir = path.resolve(env().MAIL_OUTBOX_DIR);
    await mkdir(dir, { recursive: true });
    const file = path.join(dir, `${at.replace(/[:.]/g, '-')}-${msg.to.replace(/[^a-z0-9@._-]/gi, '_')}.txt`);
    await writeFile(file, `To: ${msg.to}\nSubject: ${msg.subject}\nDate: ${at}\n\n${msg.text}\n`, 'utf8');
    this.logger.warn(`SMTP not configured — "${msg.subject}" for ${maskEmail(msg.to)} written to ${file}`);
    return this.remember({ ...msg, via: 'outbox', at });
  }

  private remember(m: SentMail): SentMail {
    this.recent.push(m);
    if (this.recent.length > 50) this.recent.shift();
    return m;
  }
}

/** "pengirim@gmail.com" → "pe***@gmail.com" (shown in the UI, never the full address). */
export function maskEmail(email: string): string {
  const [user, domain] = email.split('@');
  if (!domain) return '***';
  return `${user.slice(0, Math.min(2, user.length))}***@${domain}`;
}

@Global()
@Module({ providers: [MailService], exports: [MailService] })
export class MailModule {}
