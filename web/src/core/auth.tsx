import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

// Mock-Auth: Token liegt im sessionStorage → gilt nur für diese Browser-Sitzung (Tab), max. 2 h
const KEY = 'heizma.session';

export interface AuthUser {
  email: string;
  name: string;
  role: string;
  expiresAt: string;
}

interface Session {
  token: string;
  user: AuthUser;
}

export function getToken(): string | null {
  const s = readSession();
  return s ? s.token : null;
}

function readSession(): Session | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Session;
    if (new Date(s.user.expiresAt).getTime() <= Date.now()) {
      sessionStorage.removeItem(KEY);
      return null;
    }
    return s;
  } catch {
    return null;
  }
}

function clearSession() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event('heizma:logout'));
}

/** Wird vom ApiService bei 401 aufgerufen */
export const handleUnauthorized = clearSession;

interface AuthContextValue {
  user: AuthUser | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => readSession()?.user ?? null);

  // Abmelden bei 401 oder abgelaufener Sitzung
  useEffect(() => {
    const onLogout = () => setUser(null);
    window.addEventListener('heizma:logout', onLogout);
    return () => window.removeEventListener('heizma:logout', onLogout);
  }, []);

  useEffect(() => {
    if (!user) return;
    const ms = new Date(user.expiresAt).getTime() - Date.now();
    const t = window.setTimeout(clearSession, Math.max(0, ms));
    return () => window.clearTimeout(t);
  }, [user]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
    const session = body as Session;
    sessionStorage.setItem(KEY, JSON.stringify(session));
    setUser(session.user);
  }, []);

  const logout = useCallback(() => {
    fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    clearSession();
  }, []);

  return <AuthContext.Provider value={{ user, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth muss innerhalb von <AuthProvider> verwendet werden');
  return ctx;
}
