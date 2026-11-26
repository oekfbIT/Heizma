import { describe, expect, it } from 'vitest';
import { formatDay, formatDateTime, formatMinutes, visitationLabel, worstSeverity } from '@/lib/format';
import { SystemInteractor } from '@/modules/system/SystemInteractor';
import { TermineInteractor } from '@/modules/termine/TermineInteractor';
import { cx } from '@/ui/cx';
import { channelsToHex, mapColors, routeColor, tokenColor } from '@/ui/theme';
import { fakeApi, stammdaten } from './helpers';

describe('Design-Tokens → JavaScript', () => {
  it('wandelt RGB-Kanäle in Hex', () => {
    expect(channelsToHex('77 165 71')).toBe('#4da547');
    expect(channelsToHex('32, 36, 45')).toBe('#20242d');
    expect(channelsToHex('kaputt')).toBe('kaputt');
  });

  it('nutzt ohne DOM die CSS-Variable selbst', () => {
    expect(tokenColor('--color-ink')).toBe('var(--color-ink)');
    expect(routeColor(8)).toBe('var(--color-route-1)'); // Palette wiederholt sich
    expect(mapColors().brand).toBe('var(--color-brand-500)');
  });

  it('verbindet Klassen und ignoriert leere Werte', () => {
    expect(cx('btn', false, 'btn--primary', null, undefined, '')).toBe('btn btn--primary');
  });
});

describe('Formatierung', () => {
  it('formatiert Zeiten und Tage', () => {
    expect(formatMinutes(45)).toBe('45 min');
    expect(formatMinutes(120)).toBe('2 h');
    expect(formatMinutes(135)).toBe('2 h 15 min');
    expect(formatDay('2026-11-23')).toBe('Mo 23.11.');
    expect(formatDateTime('2026-11-03T09:12:00+01:00')).toBe('03.11.2026 09:12');
    expect(formatDateTime('kein Datum')).toBe('kein Datum');
    expect(visitationLabel('WP+PV')).toBe('Wärmepumpe + Photovoltaik');
    expect(visitationLabel(null)).toBe('Typ unbekannt');
    expect(worstSeverity([])).toBeNull();
  });
});

describe('System- und Termine-Modul', () => {
  it('beschriftet Zeitraum und Datenquelle', () => {
    const s = new SystemInteractor(fakeApi({}).api);
    expect(s.periodLabel({ from: '2026-11-23', to: '2026-11-27' })).toBe('Mo 23.11. – Fr 27.11.');
    expect(s.sourceLabel('live')).toBe('Heizma Case-Study-API');
    expect(s.sourceLabel('mock')).toBe('Mock-Daten (offline)');
  });

  it('liefert echte fixe Termine mit Zeitfenster', async () => {
    const apt = { id: 'apt_1', technicianId: 'tech_01', type: 'Inbetriebnahme', visitationType: null, durationMinutes: 240, start: '2026-11-23T08:00:00+01:00', end: '2026-11-23T12:00:00+01:00', customer: 'K', address: 'A', lat: 1, lng: 1 };
    const { api } = fakeApi({ 'GET /api/stammdaten': stammdaten({ appointments: [apt as never, { ...apt, id: 'apt_2', simulated: true } as never] }) });
    const t = new TermineInteractor(api);
    await t.data.load();
    expect(t.getTimeRange('apt_1')).toBe('08:00–12:00');
    expect(t.byId('apt_2')).toBeUndefined(); // simuliert, kein echter Termin
    expect(t.getTimeRange('apt_x')).toBe('—');
  });
});
