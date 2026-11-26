/**
 * @file      token.ts – Zustandsloses HMAC-Sitzungstoken (funktioniert serverless)
 * @layer     Backend · Auth
 * @siehe     docs/07-api.md · docs/10-code-navigation.md
 */
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { SESSION_TTL_MS } from './credentials.js';

/**
 * Zustandsloses, HMAC-signiertes Sitzungstoken (JWT-ähnlich).
 * Funktioniert auch serverless (Vercel), da keine Sitzungen im Speicher gehalten werden.
 */
const SECRET = process.env.MOCK_AUTH_SECRET ?? 'heizma-mockauth-dev-secret';

export interface SessionPayload {
  sub: string; // E-Mail
  sid: string; // Sitzungs-ID (pro Login neu)
  iat: number; // ausgestellt (ms)
  exp: number; // läuft ab (ms)
}

const b64 = (s: string) => Buffer.from(s).toString('base64url');
const sign = (data: string) => createHmac('sha256', SECRET).update(data).digest('base64url');

export function issueToken(email: string): { token: string; payload: SessionPayload } {
  const now = Date.now();
  const payload: SessionPayload = { sub: email, sid: randomUUID(), iat: now, exp: now + SESSION_TTL_MS };
  const body = b64(JSON.stringify(payload));
  return { token: `${body}.${sign(body)}`, payload };
}

export function verifyToken(token: string | undefined): SessionPayload | null {
  if (!token) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const expected = Buffer.from(sign(body));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString()) as SessionPayload;
    return payload.exp > Date.now() ? payload : null;
  } catch {
    return null;
  }
}
