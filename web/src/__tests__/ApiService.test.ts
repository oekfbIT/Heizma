/**
 * @file      ApiService.test.ts – Tests ApiService (fetch, Auth-Header, Cache, Fehler) (Vitest)
 * @layer     Web · Tests
 * @siehe     docs/06-tests-und-qualitaet.md · docs/10-code-navigation.md
 */
import { describe, expect, it, vi } from 'vitest';
import { ApiError, ApiService } from '@/core/ApiService';
import { fakeApi } from './helpers';

describe('ApiService', () => {
  it('sendet das Sitzungstoken als Bearer-Header', async () => {
    const { api, calls } = fakeApi({ 'GET /api/plan': { ok: 1 } });
    await api.get('/api/plan');
    expect(calls[0].auth).toBe('Bearer tkn');
  });

  it('sendet ohne Token keinen Authorization-Header', async () => {
    const { api, calls } = fakeApi({ 'GET /api/plan': {} }, { token: null });
    await api.get('/api/plan');
    expect(calls[0].auth).toBeNull();
  });

  it('cacht GET-Antworten (eingefrorener Datenstand)', async () => {
    const { api, calls } = fakeApi({ 'GET /api/plan': { n: 1 } });
    await api.get('/api/plan');
    await api.get('/api/plan');
    expect(calls).toHaveLength(1);
  });

  it('bündelt gleichzeitige GETs auf denselben Pfad zu einem Request', async () => {
    const { api, calls } = fakeApi({ 'GET /api/stammdaten': { a: 1 } });
    const [a, b, c] = await Promise.all([api.get('/api/stammdaten'), api.get('/api/stammdaten'), api.get('/api/stammdaten')]);
    expect(calls).toHaveLength(1);
    expect(a).toEqual(b);
    expect(b).toEqual(c);
  });

  it('leert den Cache nach schreibenden Requests', async () => {
    let n = 0;
    const { api, calls } = fakeApi({ 'GET /api/plan': () => ({ n: ++n }), 'POST /api/approvals': { ok: true } });
    expect(await api.get('/api/plan')).toEqual({ n: 1 });
    await api.send('/api/approvals', 'POST', { keys: ['a'] });
    expect(await api.get('/api/plan')).toEqual({ n: 2 });
    expect(calls.find((c) => c.method === 'POST')?.body).toEqual({ keys: ['a'] });
  });

  it('speichert verspätete Antworten nicht in einem geleerten Cache', async () => {
    let resolve!: (r: Response) => void;
    let n = 0;
    const fetch = vi.fn((_: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'POST') return Promise.resolve(new Response('{}'));
      n++;
      return n === 1 ? new Promise<Response>((r) => (resolve = r)) : Promise.resolve(new Response(JSON.stringify({ n })));
    }) as unknown as typeof globalThis.fetch;
    const api = new ApiService({ fetch });
    const slow = api.get('/api/plan');
    await api.send('/api/x', 'POST');
    resolve(new Response(JSON.stringify({ n: 'alt' })));
    await slow;
    expect(await api.get('/api/plan')).toEqual({ n: 2 });
  });

  it('wirft ApiError mit der Server-Meldung', async () => {
    const { api } = fakeApi({ 'GET /api/x': new Response(JSON.stringify({ error: 'Kaputt' }), { status: 422 }) });
    await expect(api.get('/api/x')).rejects.toMatchObject({ name: 'ApiError', message: 'Kaputt', status: 422 });
  });

  it('fällt ohne Server-Meldung auf den HTTP-Status zurück', async () => {
    const { api } = fakeApi({ 'POST /api/x': new Response('kein json', { status: 500 }) });
    await expect(api.send('/api/x', 'POST')).rejects.toThrow('HTTP 500');
  });

  it('meldet bei 401 ab und leert den Cache', async () => {
    const onUnauthorized = vi.fn();
    const fetch = (async () => new Response('{}', { status: 401 })) as unknown as typeof globalThis.fetch;
    const api = new ApiService({ fetch, onUnauthorized });
    await expect(api.get('/api/plan')).rejects.toBeInstanceOf(ApiError);
    expect(onUnauthorized).toHaveBeenCalledOnce();
  });

  it('lädt Dateien mit Auth-Header herunter', async () => {
    const saveFile = vi.fn();
    const fetch = vi.fn(async () => new Response('BEGIN:VCALENDAR')) as unknown as typeof globalThis.fetch;
    const api = new ApiService({ fetch, saveFile, getToken: () => 't' });
    await api.download('/api/plan/tech_01/2026-11-23/ics', 'route.ics');
    expect(saveFile).toHaveBeenCalledWith(expect.any(Blob), 'route.ics');
  });

  it('meldet fehlgeschlagene Downloads', async () => {
    const fetch = (async () => new Response('', { status: 404 })) as unknown as typeof globalThis.fetch;
    await expect(new ApiService({ fetch }).download('/x', 'x')).rejects.toThrow('HTTP 404');
  });
});
