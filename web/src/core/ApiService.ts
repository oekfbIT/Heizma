/**
 * @file      ApiService.ts – Einzige Stelle im Frontend mit fetch: Auth-Header, Fehler, GET-Cache
 * @layer     Web · Core (Service)
 * @siehe     docs/02-architektur.md · docs/10-code-navigation.md
 */
/**
 * ApiService – die einzige Stelle im Frontend, die `fetch` aufruft.
 *
 * Generisch: kennt keine Module, nur Pfade. Aufgaben:
 * - Sitzungstoken als `Authorization: Bearer …` mitsenden
 * - GET-Antworten cachen (der Datenstand der Case-Study-API ist eingefroren)
 * - gleichzeitige GETs auf denselben Pfad zu einem Request bündeln
 * - Schreibende Requests leeren den Cache, damit danach alles frisch geladen wird
 * - Fehler einheitlich als `ApiError` mit Server-Meldung werfen, bei 401 abmelden
 *
 * Alle Abhängigkeiten (fetch, Token, Logout) sind injizierbar → ohne Browser testbar.
 */

export type HttpMethod = 'POST' | 'PATCH' | 'DELETE';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface ApiServiceOptions {
  fetch?: typeof fetch;
  getToken?: () => string | null;
  onUnauthorized?: () => void;
}

export class ApiService {
  private cache = new Map<string, unknown>();
  private inflight = new Map<string, Promise<unknown>>();
  /** Wird bei clear() erhöht → verspätete Antworten landen nicht im geleerten Cache */
  private generation = 0;
  private readonly opts: Required<ApiServiceOptions>;

  constructor(options: ApiServiceOptions = {}) {
    this.opts = {
      fetch: options.fetch ?? ((...args) => fetch(...args)),
      getToken: options.getToken ?? (() => null),
      onUnauthorized: options.onUnauthorized ?? (() => {}),
    };
  }

  /** GET mit Cache. Parallele Aufrufe auf denselben Pfad teilen sich einen Request. */
  get<T>(path: string): Promise<T> {
    if (this.cache.has(path)) return Promise.resolve(this.cache.get(path) as T);
    const pending = this.inflight.get(path);
    if (pending) return pending as Promise<T>;

    const gen = this.generation;
    const request = this.request<T>(path)
      .then((body) => {
        if (gen === this.generation) this.cache.set(path, body);
        return body;
      })
      .finally(() => {
        if (this.inflight.get(path) === request) this.inflight.delete(path);
      });
    this.inflight.set(path, request);
    return request;
  }

  /** GET ohne Cache (z. B. Inhaltsstand für die automatische Aktualisierung) */
  fresh<T>(path: string): Promise<T> {
    return this.request<T>(path);
  }

  /** POST/PATCH/DELETE – leert danach den Cache (Plan & Prüfungen werden serverseitig neu berechnet) */
  async send<T = unknown>(path: string, method: HttpMethod, body?: unknown): Promise<T> {
    const result = await this.request<T>(path, {
      method,
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    this.clear();
    return result;
  }

  clear() {
    this.generation++;
    this.cache.clear();
    this.inflight.clear();
  }

  private async raw(path: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers);
    const token = this.opts.getToken();
    if (token) headers.set('Authorization', `Bearer ${token}`);
    const res = await this.opts.fetch(path, { ...init, headers });
    if (res.status === 401) {
      this.clear();
      this.opts.onUnauthorized();
    }
    return res;
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await this.raw(path, init);
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new ApiError((json as { error?: string }).error ?? `HTTP ${res.status}`, res.status);
    return json as T;
  }
}
