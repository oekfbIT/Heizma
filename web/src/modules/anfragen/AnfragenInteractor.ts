/**
 * @file      AnfragenInteractor.ts – Modul Anfragen: Liste, Planung je Anfrage, Entscheidungen, Eskalationen
 * @layer     Web · Modul-Interactor
 * @siehe     docs/02-architektur.md · docs/10-code-navigation.md
 */
import type { ApiService } from '@/core/ApiService';
import { Resource, ResourceFamily } from '@/core/Resource';
import type { RequestPlanning, ServiceRequest, SlotOption } from '@/lib/types';
import type { Stammdaten } from '@/modules/system/types';
import type { AnfragenData, DecisionInput, EscalationInput, GeoResult } from './types';

/** Regionsfilter-Wert für „ohne Zuständigkeit“ */
export const NO_REGION = 'ohne';

/**
 * Anfragen-Modul: offene Besichtigungs-Anfragen, ihre Planung je Anfrage und Eskalationen.
 */
export class AnfragenInteractor {
  readonly data: Resource<AnfragenData>;
  /** Planungsstand je Anfrage: GET /api/requests/:id/planning */
  readonly planning: ResourceFamily<string, RequestPlanning>;

  constructor(private readonly api: ApiService) {
    this.data = new Resource(async () => {
      const s = await api.get<Stammdaten>('/api/stammdaten');
      return {
        requests: s.requests,
        convertedRequests: s.convertedRequests ?? [],
        responsibility: s.responsibility ?? {},
        escalations: s.escalations ?? {},
      };
    });
    this.planning = new ResourceFamily((id) => api.get<RequestPlanning>(`/api/requests/${encodeURIComponent(id)}/planning`));
  }

  resources() {
    return [this.data, ...this.planning.all()];
  }

  // MARK: - Lesen & Aufbereiten
  list(): ServiceRequest[] {
    return this.data.getState().data?.requests ?? [];
  }

  /** Auch Anfragen, die durch eine Freigabe zum Termin wurden */
  byId(id: string): ServiceRequest | undefined {
    const d = this.data.getState().data;
    return d?.requests.find((r) => r.id === id) ?? d?.convertedRequests.find((r) => r.id === id);
  }

  responsibleFor(id: string): string[] {
    return this.data.getState().data?.responsibility[id] ?? [];
  }

  /** Gehört die Anfrage zur gewählten Region (Person bzw. „ohne Zuständigkeit“)? */
  inRegion(id: string, region: string): boolean {
    if (!region) return true;
    const techs = this.responsibleFor(id);
    return region === NO_REGION ? techs.length === 0 : techs.includes(region);
  }

  isEscalated(id: string): boolean {
    return !!this.data.getState().data?.escalations[id];
  }

  /** Ort aus der Adresse: „Grazbachgasse 12, 8010 Graz“ → „8010 Graz“ */
  getCity(id: string): string {
    const r = this.byId(id);
    return r ? cityOf(r.address) : '—';
  }

  /** „seit 03.11.“ */
  getAge(id: string): string {
    const r = this.byId(id);
    return r ? `seit ${r.createdAt.slice(8, 10)}.${r.createdAt.slice(5, 7)}.` : '';
  }

  /** Freitext-Notiz aus dem Vertrieb (wird angezeigt, nicht ausgewertet) */
  noteFor(id: string): string | null {
    return this.byId(id)?.notes ?? null;
  }

  // MARK: - Aktionen (Aktualisieren übernimmt der CoreInteractor)
  async options(id: string): Promise<SlotOption[]> {
    return (await this.api.get<{ options: SlotOption[] }>(`/api/requests/${encodeURIComponent(id)}/options`)).options;
  }

  /** Antwort enthält den neuen Planungsstand der Anfrage – direkt übernehmen (siehe respondDecision im API) */
  async decide(id: string, input: DecisionInput | null): Promise<RequestPlanning | null> {
    const res = await this.api.send<{ planning?: RequestPlanning | null }>(`/api/requests/${encodeURIComponent(id)}/decision`, input ? 'POST' : 'DELETE', input ?? undefined);
    return res.planning ?? null;
  }

  escalate(id: string, input: EscalationInput) {
    return this.api.send(`/api/escalations/${id}`, 'POST', input);
  }

  withdrawEscalation(id: string) {
    return this.api.send(`/api/escalations/${id}`, 'DELETE');
  }

  geocode(address: string) {
    return this.api.get<GeoResult>(`/api/geocode?address=${encodeURIComponent(address)}`);
  }

  reverseGeocode(lat: string, lng: string) {
    return this.api.get<GeoResult>(`/api/geocode/reverse?lat=${lat}&lng=${lng}`);
  }

  update(id: string, changes: Record<string, string>) {
    return this.api.send(`/api/stammdaten/requests/${encodeURIComponent(id)}`, 'PATCH', changes);
  }

  resetToOriginal(id: string) {
    return this.api.send(`/api/stammdaten/requests/${encodeURIComponent(id)}`, 'DELETE');
  }
}

export const cityOf = (address: string) => address.split(',').pop()?.trim() ?? address;
