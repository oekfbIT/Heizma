import type { ApiService } from '@/core/ApiService';
import { Resource } from '@/core/Resource';
import { formatDay } from '@/lib/format';
import type { AppConfig, LocalDb, Meta, Overview, Stammdaten } from './types';

/**
 * System-Modul: Laufzeit-Konfiguration, Kennzahlen, lokale Korrekturen und der
 * gesamte Datenbestand als Read-Model für die generischen Stammdaten-Seiten.
 */
export class SystemInteractor {
  /** Gesamter Datenbestand (alle Module) – nur für modulübergreifende Seiten */
  readonly stammdaten: Resource<Stammdaten>;
  readonly overview: Resource<Overview>;
  readonly meta: Resource<Meta>;
  readonly config: Resource<AppConfig>;
  readonly localDb: Resource<LocalDb>;

  constructor(private readonly api: ApiService) {
    this.stammdaten = new Resource(() => api.get<Stammdaten>('/api/stammdaten'));
    this.overview = new Resource(() => api.get<Overview>('/api/overview'));
    this.meta = new Resource(() => api.get<Meta>('/api/meta'));
    this.config = new Resource(() => api.get<AppConfig>('/api/config'));
    this.localDb = new Resource(() => api.get<LocalDb>('/api/local-db'));
  }

  resources() {
    return [this.stammdaten, this.overview, this.meta, this.config, this.localDb];
  }

  /** „Mo 23.11. – Fr 27.11.“ */
  periodLabel(range: { from: string; to: string }): string {
    return `${formatDay(range.from)} – ${formatDay(range.to)}`;
  }

  sourceLabel(source: 'live' | 'mock'): string {
    return source === 'live' ? 'Heizma Case-Study-API' : 'Mock-Daten (offline)';
  }

  /** Heizma-API neu laden (serverseitiger Cache) */
  reloadSource() {
    this.api.clear();
    return this.api.send('/api/reload', 'POST');
  }

  /** Nur für Tests: Freigaben, Entscheidungen, Notizen, Eskalationen löschen – Korrekturen bleiben */
  resetPlanning() {
    return this.api.send('/api/local-db/reset?scope=planning', 'POST', {});
  }
}
