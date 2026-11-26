import { describe, expect, it } from 'vitest';
import { TechnikerInteractor } from '@/modules/techniker/TechnikerInteractor';
import { fakeApi, stammdaten } from './helpers';

async function setup() {
  const { api, calls } = fakeApi({
    'GET /api/stammdaten': stammdaten({ escalations: { 'technicians:tech_01:vertrieb': { type: 'internal', at: 'x', recipient: 'V', message: 'm' } } }),
    'PATCH /api/stammdaten/technicians/tech_01': { ok: true },
    'POST /api/escalations/technicians/tech_01/techniker': { ok: true },
  });
  const t = new TechnikerInteractor(api);
  await t.data.load();
  return { t, calls };
}

describe('TechnikerInteractor – fertige Werte für Views', () => {
  it('lädt nur den eigenen Ausschnitt', async () => {
    const { t } = await setup();
    expect(Object.keys(t.data.getState().data!)).toEqual(['technicians', 'availability', 'escalations']);
  });

  it('formatiert Namen, Region, Wohnort und Label', async () => {
    const { t } = await setup();
    expect(t.getName('tech_01')).toBe('Techniker Nord');
    expect(t.getShortName('tech_01')).toBe('Nord');
    expect(t.getHome('tech_02')).toBe('8010 Graz');
    expect(t.getLabel('tech_02')).toBe('Techniker Süd · 8010 Graz');
  });

  it('fällt bei unbekannter ID auf die ID zurück', async () => {
    const { t } = await setup();
    expect(t.getName('tech_99')).toBe('tech_99');
    expect(t.getShortName('tech_99')).toBe('tech_99');
    expect(t.getHome('tech_99')).toBe('—');
  });

  it('beschreibt die Verfügbarkeit je Tag', async () => {
    const { t } = await setup();
    expect(t.getAvailability('tech_01', '2026-11-23')).toBe('07:00–12:00');
    expect(t.getAvailability('tech_02', '2026-11-23')).toBe('gesperrt');
    expect(t.getAvailability('tech_02', '2026-11-27')).toBe('nicht verfügbar');
    expect(t.statusOn('tech_01', '2026-11-24')).toBe('available');
    expect(t.statusOn('tech_02', '2026-11-23')).toBe('blocked');
    expect(t.statusOn('tech_02', '2026-11-24')).toBe('none');
  });

  it('liefert Planungstage sortiert und ohne Duplikate', async () => {
    const { t } = await setup();
    expect(t.days()).toEqual(['2026-11-23', '2026-11-24']);
    expect(t.days()).toBe(t.days()); // gecacht
  });

  it('vergibt stabile Farben je Person', async () => {
    const { t } = await setup();
    const c = t.colors();
    expect(c.tech_01).toBe('var(--color-route-1)');
    expect(c.tech_02).toBe('var(--color-route-2)');
    expect(t.colors()).toBe(c);
  });

  it('findet Eskalationen je Ziel', async () => {
    const { t } = await setup();
    expect(t.escalation('tech_01', 'vertrieb')?.recipient).toBe('V');
    expect(t.escalation('tech_01', 'techniker')).toBeUndefined();
  });

  it('schreibt nur über eigene Endpunkte', async () => {
    const { t, calls } = await setup();
    await t.update('tech_01', { name: 'Neu' });
    await t.escalate('tech_01', 'techniker', { recipient: 'x', message: 'm', affectedRequests: [] });
    expect(calls.filter((c) => c.method !== 'GET').map((c) => `${c.method} ${c.path}`)).toEqual([
      'PATCH /api/stammdaten/technicians/tech_01',
      'POST /api/escalations/technicians/tech_01/techniker',
    ]);
  });
});
