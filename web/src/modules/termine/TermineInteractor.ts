/**
 * @file      TermineInteractor.ts – Modul Termine: fixe Termine (REGEL-6 – nicht verschiebbar)
 * @layer     Web · Modul-Interactor
 * @siehe     docs/02-architektur.md · docs/10-code-navigation.md
 */
import type { ApiService } from '@/core/ApiService';
import { Resource } from '@/core/Resource';
import type { Appointment } from '@/lib/types';
import type { Stammdaten } from '@/modules/system/types';

/**
 * Termine-Modul: fixe Termine (Besichtigungen, Inbetriebnahmen). Nicht verschiebbar –
 * die Planung behandelt sie als feste Stopps.
 */
export class TermineInteractor {
  readonly data: Resource<Appointment[]>;

  constructor(private readonly api: ApiService) {
    this.data = new Resource(async () => (await api.get<Stammdaten>('/api/stammdaten')).appointments);
  }

  resources() {
    return [this.data];
  }

  list(): Appointment[] {
    return this.data.getState().data ?? [];
  }

  /** Echter Termin aus der API (keine aus freigegebenen Routen simulierten) */
  byId(id: string): Appointment | undefined {
    return this.list().find((a) => a.id === id && !a.simulated);
  }

  /** „08:00–12:00“ aus ISO-Zeitstempeln */
  getTimeRange(id: string): string {
    const a = this.byId(id);
    return a ? `${a.start.slice(11, 16)}–${a.end.slice(11, 16)}` : '—';
  }

  update(id: string, changes: Record<string, string>) {
    return this.api.send(`/api/stammdaten/appointments/${encodeURIComponent(id)}`, 'PATCH', changes);
  }

  resetToOriginal(id: string) {
    return this.api.send(`/api/stammdaten/appointments/${encodeURIComponent(id)}`, 'DELETE');
  }
}
