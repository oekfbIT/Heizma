/**
 * @file      index.ts – Auth-Router (/api/auth/*) + requireAuth-Middleware für alle übrigen /api-Routen
 * @layer     Backend · Auth
 * @siehe     docs/07-api.md · docs/10-code-navigation.md
 */
import { timingSafeEqual } from 'node:crypto';
import { Router, type NextFunction, type Request, type Response } from 'express';
import { MOCK_USER } from './credentials.js';
import { issueToken, verifyToken, type SessionPayload } from './token.js';

declare module 'express-serve-static-core' {
  interface Request {
    session?: SessionPayload;
  }
}

const safeEqual = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

const bearer = (req: Request) => req.header('authorization')?.replace(/^Bearer\s+/i, '');

const userInfo = (s: SessionPayload) => ({
  email: s.sub,
  name: MOCK_USER.name,
  role: MOCK_USER.role,
  expiresAt: new Date(s.exp).toISOString(),
});

/** /api/auth/login, /api/auth/me, /api/auth/logout */
export const authRouter = Router();

authRouter.post('/login', (req, res) => {
  const { email, password } = (req.body ?? {}) as { email?: string; password?: string };
  const ok =
    typeof email === 'string' &&
    typeof password === 'string' &&
    safeEqual(email.trim().toLowerCase(), MOCK_USER.email) &&
    safeEqual(password, MOCK_USER.password);
  if (!ok) return res.status(401).json({ error: 'E-Mail oder Passwort ist falsch.' });
  const { token, payload } = issueToken(MOCK_USER.email);
  res.json({ token, user: userInfo(payload) });
});

authRouter.get('/me', (req, res) => {
  const session = verifyToken(bearer(req));
  if (!session) return res.status(401).json({ error: 'Nicht angemeldet oder Sitzung abgelaufen.' });
  res.json({ user: userInfo(session) });
});

// Token ist zustandslos – Logout passiert clientseitig (Token verwerfen)
authRouter.post('/logout', (_req, res) => res.json({ ok: true }));

/** Schützt alle folgenden Routen */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const session = verifyToken(bearer(req));
  if (!session) return res.status(401).json({ error: 'Nicht angemeldet oder Sitzung abgelaufen.' });
  req.session = session;
  next();
}
