/**
 * @file      RoutenInteractor.test.ts – Tests Modul Routen (Vitest)
 * @layer     Web · Tests
 * @siehe     docs/06-tests-und-qualitaet.md · docs/10-code-navigation.md
 */
import { describe, expect, it } from 'vitest';
import { ROUTE_LEVEL, RoutenInteractor } from '@/modules/routen/RoutenInteractor';
import { fakeApi, plan } from './helpers';

const routen = new RoutenInteractor(fakeApi({}).api);
const p = plan();

describe('RoutenInteractor – reine Plan-Auswertung', () => {
  it('gruppiert Regelverstöße nach Stopp und Route', () => {
    const v = routen.violationsFor(p, 'tech_02', '2026-11-23');
    expect(v.get('req_3')).toEqual(['Kunde erst ab 12:00']);
    expect(v.get(ROUTE_LEVEL)).toEqual(['Heimfahrt zu spät']);
    expect(routen.violationsFor(p, 'tech_02', '2026-11-24').size).toBe(0);
  });

  it('zählt freigegebene Routen je Tag (leere Routen zählen nicht)', () => {
    expect(routen.dayStatus(p, '2026-11-23')).toEqual({ total: 2, approved: 1, done: false });
    expect(routen.dayStatus(p, '2026-11-23', (id) => id === 'tech_01')).toEqual({ total: 1, approved: 1, done: true });
    expect(routen.dayStatus(p, '2026-11-24')).toEqual({ total: 0, approved: 0, done: false });
  });

  it('beschriftet den Tagesstatus', () => {
    expect(routen.dayStatusLabel({ total: 0, approved: 0, done: false })).toBe('keine Routen');
    expect(routen.dayStatusLabel({ total: 2, approved: 2, done: true })).toBe('✓ erledigt');
    expect(routen.dayStatusLabel({ total: 3, approved: 1, done: false })).toBe('2 offen');
  });

  it('ordnet jeder Anfrage einen Plan-Status zu', () => {
    const s = routen.requestStatuses(p, (id) => (id === 'tech_01' ? 'Nord' : 'Süd'));
    expect(s.get('req_1')).toMatchObject({ planned: true, label: 'Mo 23.11. · Nord', tone: 'approved' });
    expect(s.get('req_3')).toMatchObject({ planned: true, label: '📌 Mo 23.11. · Süd', tone: 'proposed' });
    expect(s.get('req_4')).toMatchObject({ planned: false, label: 'Warteliste', tone: 'waitlist' });
    expect(s.get('req_5')?.tone).toBe('excluded');
    expect(s.get('req_6')?.tone).toBe('unplannable');
  });

  it('erkennt Ausnahmen und Kapazitäts-Warteliste', () => {
    expect(routen.exceptionIds(p)).toEqual(new Set(['req_1']));
    expect(routen.hasException(p, 'tech_01', '2026-11-23')).toBe(true);
    expect(routen.hasException(p, 'tech_02', '2026-11-23')).toBe(false);
    expect(routen.capacityWaitlist(p, 'req_4')).toHaveLength(1);
    expect(routen.capacityWaitlist(p, 'req_6')).toHaveLength(0);
    expect(routen.routeKey('tech_01', '2026-11-23')).toBe('tech_01@2026-11-23');
  });

  it('kommt ohne Prüfergebnis aus', () => {
    const bare = plan({ verification: undefined });
    expect(routen.violationsFor(bare, 'tech_02', '2026-11-23').size).toBe(0);
    expect(routen.exceptionIds(bare).size).toBe(0);
    expect(routen.hasException(bare, 'tech_01', '2026-11-23')).toBe(false);
  });
});
