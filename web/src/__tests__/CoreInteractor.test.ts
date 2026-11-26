/**
 * @file      CoreInteractor.test.ts – Tests CoreInteractor (mutate → aktive Resources neu laden) (Vitest)
 * @layer     Web · Tests
 * @siehe     docs/06-tests-und-qualitaet.md · docs/10-code-navigation.md
 */
import { describe, expect, it } from 'vitest';
import { CoreInteractor } from '@/core/CoreInteractor';
import { fakeApi, plan, stammdaten } from './helpers';

function setup() {
  let planVersion = 0;
  const f = fakeApi({
    'GET /api/stammdaten': stammdaten(),
    'GET /api/plan': () => ({ ...plan(), version: ++planVersion }),
    'GET /api/overview': {},
    'POST /api/approvals': { ok: true },
    'DELETE /api/approvals': { ok: true },
    'PATCH /api/stammdaten/appointments/apt_1': { ok: true },
    'DELETE /api/stammdaten/requests/req_1': { ok: true },
    'POST /api/local-db/reset': { ok: true },
    'POST /api/reload': { ok: true },
    'POST /api/escalations/req_1': { ok: true },
  });
  return { core: new CoreInteractor(f.api), calls: f.calls };
}

describe('CoreInteractor', () => {
  it('lädt nach einer Änderung alle angezeigten Daten neu – und nur diese', async () => {
    const { core, calls } = setup();
    const off = core.routen.plan.subscribe(() => {});
    await core.routen.plan.load();
    await core.approveDay('2026-11-23');
    expect((core.routen.plan.getState().data as unknown as { version: number }).version).toBe(2);
    expect(calls.some((c) => c.path === '/api/overview')).toBe(false); // nicht angezeigt → nicht geladen
    off();
  });

  it('gibt frei bzw. nimmt die Freigabe zurück', async () => {
    const { core, calls } = setup();
    await core.approveRoute('tech_01', '2026-11-23', false);
    await core.approveRoute('tech_01', '2026-11-23', true);
    const writes = calls.filter((c) => c.path === '/api/approvals');
    expect(writes.map((c) => c.method)).toEqual(['POST', 'DELETE']);
    expect(writes[0].body).toEqual({ keys: ['tech_01@2026-11-23'] });
  });

  it('leitet Datenkorrekturen an das zuständige Modul', async () => {
    const { core, calls } = setup();
    await core.updateEntity('appointments', 'apt_1', { address: 'x' });
    await core.resetEntity('requests', 'req_1');
    expect(calls.filter((c) => c.method !== 'GET').map((c) => `${c.method} ${c.path}`)).toEqual([
      'PATCH /api/stammdaten/appointments/apt_1',
      'DELETE /api/stammdaten/requests/req_1',
    ]);
  });

  it('verbindet Plan-Status mit Personennamen aus dem Techniker-Modul', async () => {
    const { core } = setup();
    await core.techniker.data.load();
    expect(core.requestStatuses(plan()).get('req_1')?.label).toBe('Mo 23.11. · Nord');
  });

  it('setzt den Planungsstand zurück und lädt die Quelle neu', async () => {
    const { core, calls } = setup();
    await core.resetPlanning();
    await core.reloadAll();
    await core.escalateRequest('req_1', { type: 'internal', recipient: 'V', message: 'm' });
    expect(calls.map((c) => c.path)).toEqual(['/api/local-db/reset?scope=planning', '/api/reload', '/api/escalations/req_1']);
  });

  it('gibt Fehler der Aktion an die View weiter', async () => {
    const { core } = setup();
    await expect(core.confirmNote('req_x', null)).rejects.toThrow(/not found/);
  });
});
