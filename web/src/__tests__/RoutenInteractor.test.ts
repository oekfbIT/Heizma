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
    expect(routen.dayStatusLabel({ total: 2, approved: 2, done: true })).toBe('✓ freigegeben');
    expect(routen.dayStatusLabel({ total: 3, approved: 1, done: false })).toBe('2 zur Freigabe');
  });

  it('Bilanz: jede Anfrage genau einmal, die Töpfe ergeben die Gesamtzahl', () => {
    const q = plan({
      unassigned: [
        { requestId: 'req_4', reason: 'Kapazität erschöpft (Warteliste)' },
        { requestId: 'req_7', reason: 'Kapazität erschöpft (Warteliste)' },
        { requestId: 'req_5', reason: 'Aus dem Plan genommen: Kunde ruft zurück' },
        { requestId: 'req_6', reason: 'Keine Koordinaten – zuerst geokodieren' },
        { requestId: 'req_8', reason: 'Nicht zuordenbar (kein Gebiet, > 15 km)' },
        { requestId: 'req_9', reason: 'Keine Koordinaten – zuerst geokodieren' },
      ],
    });
    const b = routen.balance(q, { req_4: { date: '2026-11-30' } });
    expect(b).toMatchObject({ total: 8, thisWeek: 2, approved: 1, preplanned: 1, waitlist: 1, unplannable: 3, excluded: 1 });
    expect(b.thisWeek + b.preplanned + b.waitlist + b.unplannable + b.excluded).toBe(b.total);
    expect(b.total).toBe(q.routes.flatMap((r) => r.stops).length + q.unassigned.length);
    expect(b.preplannedByWeek).toEqual([{ week: 49, count: 1 }]);
    expect(b.unplannableByReason).toEqual([
      { reason: 'Keine Koordinaten', count: 2 },
      { reason: 'Nicht zuordenbar', count: 1 },
    ]);
    // Filter (z. B. Region) wirkt auf alle Töpfe gleich – die Summe bleibt stimmig
    const only = routen.balance(q, {}, (id) => ['req_1', 'req_6'].includes(id));
    expect(only).toMatchObject({ total: 2, thisWeek: 1, unplannable: 1 });
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
