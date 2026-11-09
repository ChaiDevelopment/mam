import { hashPassword, verifyPassword } from './password';
import { loginSchema, registerSchema } from '@mam/validation';

describe('password hashing', () => {
  it('hashes with a random salt and verifies only the right password', async () => {
    const a = await hashPassword('rahasia-sekali-123');
    const b = await hashPassword('rahasia-sekali-123');
    expect(a).toMatch(/^scrypt\$16384\$8\$1\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/);
    expect(a).not.toBe(b);
    expect(await verifyPassword('rahasia-sekali-123', a)).toBe(true);
    expect(await verifyPassword('rahasia-sekali-124', a)).toBe(false);
  });

  it('rejects missing or malformed hashes', async () => {
    expect(await verifyPassword('x', null)).toBe(false);
    expect(await verifyPassword('x', 'plain-text')).toBe(false);
    expect(await verifyPassword('x', 'bcrypt$1$2$3$4$5')).toBe(false);
  });

  it('normalizes unicode so the same visible password always matches', async () => {
    const h = await hashPassword('kopí-enak-1');
    expect(await verifyPassword('kopí-enak-1', h)).toBe(true);
  });
});

describe('register / login validation', () => {
  it('requires a valid email, a display name and a password of 8–128 chars', () => {
    expect(registerSchema.safeParse({ email: 'a@b.id', password: 'abcd1234', displayName: 'Ani' }).success).toBe(true);
    expect(registerSchema.safeParse({ email: 'bukan-email', password: 'abcd1234', displayName: 'Ani' }).success).toBe(false);
    expect(registerSchema.safeParse({ email: 'a@b.id', password: 'pendek1', displayName: 'Ani' }).success).toBe(false);
    expect(registerSchema.safeParse({ email: 'a@b.id', password: 'x'.repeat(129), displayName: 'Ani' }).success).toBe(false);
    expect(registerSchema.safeParse({ email: 'a@b.id', password: 'abcd1234', displayName: ' ' }).success).toBe(false);
  });

  it('lower-cases and trims the email', () => {
    expect(loginSchema.parse({ email: '  Budi@MAM.Local ', password: 'x' }).email).toBe('budi@mam.local');
  });
});
