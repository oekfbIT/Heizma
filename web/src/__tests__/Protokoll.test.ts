/**
 * @file      Protokoll.test.ts – Tests Protokoll-Darstellung (Vitest)
 * @layer     Web · Tests
 * @siehe     docs/06-tests-und-qualitaet.md · docs/10-code-navigation.md
 */
import { describe, expect, it } from 'vitest';
import { SystemInteractor, describeLogEntry } from '@/modules/system/SystemInteractor';
import type { LogEntry } from '@/modules/system/types';
import { circlePolygon, inPolygon, parseRegion, regionPresets, serializeRegion } from '@/modules/techniker/TechnikerInteractor';
import { fakeApi, stammdaten } from './helpers';

const name = (id: string) => ({ tech_01: 'Nord', tech_02: 'Süd' })[id] ?? id;
const at = '2026-11-26T10:00:00.000Z';

describe('Aktivitätsprotokoll – Einträge lesbar aufbereiten', () => {
  it('Freigabe: Person · Tag und Anzahl Stopps, Link in die Routenplanung', () => {
    const item = describeLogEntry({ at, entity: 'approvals', id: 'tech_01@2026-11-23', action: 'approve', changes: { stops: ['req_1', 'req_2'] } }, name);
    expect(item).toMatchObject({ category: 'freigabe', action: 'Route freigegeben', target: { label: 'Nord · Mo 23.11.', to: '/planer' }, detail: '2 Stopps' });
  });

  it('Eingriff: Ziel, Begründung und bewusste Ausnahme', () => {
    const item = describeLogEntry(
      { at, entity: 'requests', id: 'req_1046', action: 'fixiert', reason: 'Kunde hat zugesagt', changes: { before: null, after: { mode: 'pin', technicianId: 'tech_02', date: '2026-11-24' }, override: true } },
      name,
    );
    expect(item).toMatchObject({ category: 'planung', action: 'Fixiert', detail: '→ Süd · Di 24.11.', reason: 'Kunde hat zugesagt', exception: true });
    expect(item.target.to).toBe('/stammdaten/anfragen/req_1046');
  });

  it('Eskalation an eine Person verlinkt auf die Person', () => {
    const item = describeLogEntry({ at, entity: 'escalations', id: 'technicians:tech_01:techniker', action: 'escalate', changes: { type: 'technician_request' } }, name);
    expect(item).toMatchObject({ category: 'eskalation', action: 'Außendienst angefragt', target: { label: 'Nord', to: '/stammdaten/techniker/tech_01' } });
  });

  it('Korrektur nennt die Felder – Koordinaten nur einmal, Gebiet mit Eckpunkten', () => {
    expect(describeLogEntry({ at, entity: 'requests', id: 'req_1', action: 'update', changes: { lat: 48.1, lng: 16.3 } }, name).detail).toBe('Koordinaten');
    const region = describeLogEntry({ at, entity: 'technicians', id: 'tech_02', action: 'update', changes: { region: [{}, {}, {}, {}] } }, name);
    expect(region).toMatchObject({ category: 'korrektur', detail: 'Gebiet (4 Eckpunkte)', target: { label: 'Süd' } });
  });

  it('Notiz-Zeitgrenze und Demo-Reset', () => {
    expect(describeLogEntry({ at, entity: 'requests', id: 'req_1', action: 'notiz-bestaetigt', changes: { latest: '12:00' } }, name)).toMatchObject({ category: 'notiz', detail: 'bis 12:00' });
    expect(describeLogEntry({ at, entity: 'system', id: 'demo', action: 'demo-reset' }, name)).toMatchObject({ category: 'system', action: 'Demo zurückgesetzt' });
  });

  it('blendet doppelte Termin-Einträge aus und zählt je Bereich', () => {
    const { api } = fakeApi({});
    const sys = new SystemInteractor(api);
    const entries: LogEntry[] = [
      { at, entity: 'approvals', id: 'tech_01@2026-11-23', action: 'approve', changes: { stops: ['req_1'] } },
      { at, entity: 'requests', id: 'req_1', action: 'termin' },
      { at, entity: 'requests', id: 'req_2', action: 'aus-plan', reason: 'Kunde ruft zurück' },
    ];
    const items = sys.logItems(entries, name);
    expect(items.map((i) => i.action)).toEqual(['Route freigegeben', 'Aus dem Plan genommen']);
    expect(sys.logCounts(items)).toMatchObject({ all: 2, freigabe: 1, planung: 1, eskalation: 0 });
  });

  it('Demo zurücksetzen ruft den Reset-Endpunkt auf', async () => {
    const { api, calls } = fakeApi({ 'POST /api/local-db/reset': { ok: true } });
    await new SystemInteractor(api).resetDemo();
    expect(calls.map((c) => `${c.method} ${c.path}`)).toContain('POST /api/local-db/reset');
  });
});

describe('Gebiets-Vorlagen', () => {
  const data = stammdaten();
  const tech = data.technicians[0];

  it('Umkreis und Gebiete anderer Personen, nie das eigene', () => {
    const presets = regionPresets(tech, data.technicians);
    expect(presets.some((p) => p.value === 'circle:50')).toBe(true);
    expect(presets.some((p) => p.value === `copy:${tech.id}`)).toBe(false);
    expect(presets.every((p) => p.polygon.length >= 3)).toBe(true);
  });

  it('Kreis enthält den Mittelpunkt, aber keinen weit entfernten Punkt', () => {
    const circle = circlePolygon({ lat: 48.2, lng: 16.37 }, 30);
    expect(inPolygon({ lat: 48.2, lng: 16.37 }, circle)).toBe(true);
    expect(inPolygon({ lat: 48.2, lng: 16.6 }, circle)).toBe(true); // ~17 km
    expect(inPolygon({ lat: 47.07, lng: 15.44 }, circle)).toBe(false); // Graz
  });

  it('Text-Format hin und zurück', () => {
    const poly = [{ lat: 48.1, lng: 16.2 }, { lat: 48.3, lng: 16.2 }, { lat: 48.2, lng: 16.5 }];
    expect(parseRegion(serializeRegion(poly))).toEqual(poly);
    expect(parseRegion('48.1, 16.2\nkaputt\n')).toEqual([{ lat: 48.1, lng: 16.2 }]);
  });
});
