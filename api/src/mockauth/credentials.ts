/**
 * @file      credentials.ts – Mock-Login: Planer-Zugang + Sitzungsdauer (SICHERHEIT: nur Demo, kein echtes IAM)
 * @layer     Backend · Auth
 * @siehe     docs/09-setup.md · docs/10-code-navigation.md
 */
// Mock-Auth: Planer-Zugang aus der .env (Fallback: fest hinterlegt) – keine externen Calls, keine Datenbank
export const MOCK_USER = {
  email: (process.env.MOCK_AUTH_EMAIL ?? 'planner@heizma.at').trim().toLowerCase(),
  password: process.env.MOCK_AUTH_PASSWORD ?? '1nvite0nly',
  name: 'Planung',
  role: 'planner',
} as const;

/** Gültigkeit einer Sitzung: Standard 2 Stunden (MOCK_AUTH_TTL_HOURS) */
const hours = Number(process.env.MOCK_AUTH_TTL_HOURS);
export const SESSION_TTL_MS = (Number.isFinite(hours) && hours > 0 ? hours : 2) * 60 * 60 * 1000;
