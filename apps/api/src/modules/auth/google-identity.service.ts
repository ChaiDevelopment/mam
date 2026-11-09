import { BadRequestException, Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { CodeChallengeMethod, OAuth2Client, type TokenPayload } from 'google-auth-library';
import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import { env } from '../../config/env';

export interface GoogleIdentity {
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string | null;
  picture: string | null;
}

/** Google OAuth 2.0 / OpenID Connect. Used ONLY to authenticate MAM! accounts. */
@Injectable()
export class GoogleIdentityService {
  private client: OAuth2Client | null = null;

  isConfigured(): boolean {
    const e = env();
    return !!(e.GOOGLE_OAUTH_CLIENT_ID && e.GOOGLE_OAUTH_CLIENT_SECRET);
  }

  private oauth(): OAuth2Client {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException('Login Google belum dikonfigurasi di server (GOOGLE_OAUTH_CLIENT_ID / SECRET).');
    }
    this.client ??= new OAuth2Client({ clientId: env().GOOGLE_OAUTH_CLIENT_ID, clientSecret: env().GOOGLE_OAUTH_CLIENT_SECRET });
    return this.client;
  }

  redirectUriFor(app: 'web' | 'admin'): string {
    const e = env();
    const uri = app === 'admin' ? e.GOOGLE_OAUTH_REDIRECT_URI_ADMIN : e.GOOGLE_OAUTH_REDIRECT_URI_WEB;
    if (uri) return uri;
    const base = app === 'admin' ? e.ADMIN_PUBLIC_URL : e.WEB_PUBLIC_URL;
    return `${base}/api/v1/auth/google/callback`;
  }

  /** Builds the authorization URL with state, nonce and PKCE (S256). */
  createAuthRequest(app: 'web' | 'admin') {
    const state = randomBytes(24).toString('base64url');
    const nonce = randomBytes(24).toString('base64url');
    const codeVerifier = randomBytes(48).toString('base64url');
    const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url');
    const url = this.oauth().generateAuthUrl({
      access_type: 'online',
      scope: ['openid', 'email', 'profile'],
      state,
      nonce,
      prompt: 'select_account',
      code_challenge: codeChallenge,
      code_challenge_method: CodeChallengeMethod.S256,
      redirect_uri: this.redirectUriFor(app),
    } as Parameters<OAuth2Client['generateAuthUrl']>[0]);
    return { url, state, nonce, codeVerifier };
  }

  async exchangeCode(code: string, codeVerifier: string, app: 'web' | 'admin', expectedNonce: string): Promise<GoogleIdentity> {
    let idToken: string | null | undefined;
    try {
      const { tokens } = await this.oauth().getToken({ code, codeVerifier, redirect_uri: this.redirectUriFor(app) });
      idToken = tokens.id_token;
    } catch {
      throw new UnauthorizedException('Gagal menukar kode otorisasi Google.');
    }
    if (!idToken) throw new UnauthorizedException('Google tidak mengembalikan ID token.');
    return this.verifyIdToken(idToken, expectedNonce);
  }

  /** Verifies signature, issuer, audience, expiry and nonce of a Google ID token. */
  async verifyIdToken(idToken: string, expectedNonce: string): Promise<GoogleIdentity> {
    const e = env();
    const audiences = [e.GOOGLE_OAUTH_CLIENT_ID, ...(e.GOOGLE_OAUTH_ALLOWED_AUDIENCES?.split(',') ?? [])]
      .map((s) => s?.trim())
      .filter((s): s is string => !!s);
    if (!audiences.length) throw new ServiceUnavailableException('Login Google belum dikonfigurasi di server.');
    let payload: TokenPayload | undefined;
    try {
      const ticket = await this.oauth().verifyIdToken({ idToken, audience: audiences });
      payload = ticket.getPayload();
    } catch {
      throw new UnauthorizedException('ID token Google tidak valid.');
    }
    if (!payload?.sub || !payload.email) throw new UnauthorizedException('ID token Google tidak lengkap.');
    if (!['accounts.google.com', 'https://accounts.google.com'].includes(payload.iss)) {
      throw new UnauthorizedException('Penerbit token tidak valid.');
    }
    const nonce = payload.nonce ?? '';
    if (!nonce || nonce.length !== expectedNonce.length || !timingSafeEqual(Buffer.from(nonce), Buffer.from(expectedNonce))) {
      throw new UnauthorizedException('Nonce token tidak cocok.');
    }
    if (!payload.email_verified) throw new BadRequestException('Email Google kamu belum terverifikasi.');
    return {
      sub: payload.sub,
      email: payload.email.toLowerCase(),
      emailVerified: !!payload.email_verified,
      name: payload.name ?? null,
      picture: payload.picture ?? null,
    };
  }
}
