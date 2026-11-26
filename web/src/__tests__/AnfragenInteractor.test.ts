/**
 * @file      AnfragenInteractor.test.ts – Tests Modul Anfragen (Vitest)
 * @layer     Web · Tests
 * @siehe     docs/06-tests-und-qualitaet.md · docs/10-code-navigation.md
 */
import { describe, expect, it } from 'vitest';
import { AnfragenInteractor, NO_REGION, cityOf } from '@/modules/anfragen/AnfragenInteractor';
import { fakeApi, stammdaten } from './helpers';

async function setup() {
  const { api, calls } = fakeApi({
    'GET /api/stammdaten': stammdaten({ escalations: { req_1: { type: 'internal', at: 'x', recipient: 'V', message: 'm' } } }),
    'GET /api/requests/req_1/options': { options: [{ technicianId: 'tech_02', date: '2026-11-24' }] },
    'GET /api/requests/req_1/planning': { requestId: 'req_1', status: 'planned' },
    'GET /api/geocode': { lat: 47, lng: 15, address: 'Graz', source: 'osm', precision: 'town' },
    'POST /api/requests/req_1/decision': { ok: true },
    'DELETE /api/requests/req_1/decision': { ok: true },
  });
  const a = new AnfragenInteractor(api);
  await a.data.load();
  return { a, calls };
}

describe('AnfragenInteractor', () => {
  it('findet Anfragen – auch solche, die schon Termin sind', async () => {
    const { a } = await setup();
    expect(a.byId('req_1')?.customer).toBe('Kunde 1');
    expect(a.byId('req_9')?.customer).toBe('Kunde 9');
    expect(a.list()).toHaveLength(1);
  });

  it('filtert nach Region bzw. „ohne Zuständigkeit“', async () => {
    const { a } = await setup();
    expect(a.inRegion('req_1', '')).toBe(true);
    expect(a.inRegion('req_1', 'tech_02')).toBe(true);
    expect(a.inRegion('req_1', 'tech_01')).toBe(false);
    expect(a.inRegion('req_2', NO_REGION)).toBe(true);
    expect(a.inRegion('req_1', NO_REGION)).toBe(false);
  });

  it('bereitet Ort, Alter und Eskalation auf', async () => {
    const { a } = await setup();
    expect(a.getCity('req_1')).toBe('8010 Graz');
    expect(a.getAge('req_1')).toBe('seit 03.11.');
    expect(a.getCity('req_x')).toBe('—');
    expect(a.isEscalated('req_1')).toBe(true);
    expect(cityOf('ohne Komma')).toBe('ohne Komma');
  });

  it('liefert die Vertriebsnotiz unverändert (keine Auswertung)', async () => {
    const { a } = await setup();
    expect(a.noteFor('req_1')).toBe('nur vormittags erreichbar');
    expect(a.noteFor('req_x')).toBeNull();
  });

  it('lädt Optionen, Planung je Anfrage und Geocoding', async () => {
    const { a } = await setup();
    expect(await a.options('req_1')).toHaveLength(1);
    expect((await a.planning.get('req_1').load())?.status).toBe('planned');
    expect((await a.geocode('Grazbachgasse')).precision).toBe('town');
  });

  it('sendet Entscheidungen als POST und Zurücknehmen als DELETE', async () => {
    const { a, calls } = await setup();
    await a.decide('req_1', { mode: 'pin', reason: '' });
    await a.decide('req_1', null);
    const writes = calls.filter((c) => c.method !== 'GET');
    expect(writes.map((c) => c.method)).toEqual(['POST', 'DELETE']);
    expect(writes[0].body).toEqual({ mode: 'pin', reason: '' });
  });
});
