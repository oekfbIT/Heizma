/**
 * @file      Resource.test.ts – Tests Resource/ResourceFamily (Ladezustand) (Vitest)
 * @layer     Web · Tests
 * @siehe     docs/06-tests-und-qualitaet.md · docs/10-code-navigation.md
 */
import { describe, expect, it } from 'vitest';
import { Resource, ResourceFamily } from '@/core/Resource';

describe('Resource', () => {
  it('lädt Daten und benachrichtigt Abonnenten', async () => {
    const r = new Resource(async () => 42);
    const seen: (number | null)[] = [];
    r.subscribe(() => seen.push(r.getState().data));
    expect(await r.load()).toBe(42);
    expect(r.getState()).toEqual({ data: 42, error: null, loading: false });
    expect(seen).toEqual([null, 42]); // erst loading, dann Daten
  });

  it('hält Fehler fest und behält alte Daten', async () => {
    let fail = false;
    const r = new Resource(async () => {
      if (fail) throw new Error('weg');
      return 'ok';
    });
    await r.load();
    fail = true;
    expect(await r.load()).toBeNull();
    expect(r.getState()).toEqual({ data: 'ok', error: 'weg', loading: false });
  });

  it('übernimmt nur das Ergebnis der jüngsten Ladeanfrage', async () => {
    const resolvers: ((v: string) => void)[] = [];
    const r = new Resource(() => new Promise<string>((res) => resolvers.push(res)));
    const first = r.load();
    const second = r.load();
    resolvers[1]('neu');
    await second;
    resolvers[0]('alt');
    await first;
    expect(r.getState().data).toBe('neu');
  });

  it('ist aktiv, solange jemand abonniert hat', () => {
    const r = new Resource(async () => 1);
    expect(r.active).toBe(false);
    const off = r.subscribe(() => {});
    expect(r.active).toBe(true);
    off();
    expect(r.active).toBe(false);
  });
});

describe('ResourceFamily', () => {
  it('liefert eine stabile Instanz pro Schlüssel', async () => {
    const f = new ResourceFamily(async (id: string) => `planung:${id}`);
    expect(f.get('a')).toBe(f.get('a'));
    expect(f.get('a')).not.toBe(f.get('b'));
    expect(await f.get('b').load()).toBe('planung:b');
    expect(f.all()).toHaveLength(2);
  });
});
