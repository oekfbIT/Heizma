import { AnfragenInteractor } from '@/modules/anfragen/AnfragenInteractor';
import type { DecisionInput, EscalationInput, NoteConstraint } from '@/modules/anfragen/types';
import { RoutenInteractor } from '@/modules/routen/RoutenInteractor';
import type { RequestPlanStatus } from '@/modules/routen/types';
import { SystemInteractor } from '@/modules/system/SystemInteractor';
import type { EntityKey } from '@/modules/system/types';
import { TechnikerInteractor } from '@/modules/techniker/TechnikerInteractor';
import type { EscalationTarget, TechnicianEscalationInput } from '@/modules/techniker/types';
import { TermineInteractor } from '@/modules/termine/TermineInteractor';
import type { Plan } from '@/lib/types';
import { ApiService } from './ApiService';
import type { Resource } from './Resource';

/**
 * CoreInteractor – Fassade und einziger Einstiegspunkt für Views.
 *
 * - hält die Modul-Interactors (jeder kennt nur seine eigenen Daten)
 * - bündelt alle schreibenden Aktionen: ausführen → Cache ist leer → alle gerade
 *   angezeigten Daten neu laden. Views müssen nach einer Änderung nichts mehr selbst nachladen.
 * - enthält Logik, die mehrere Module braucht (z. B. Plan-Status mit Personennamen)
 *
 * Abhängigkeiten zeigen nach unten (View → Core → Modul → ApiService), Daten fließen nach oben.
 */
export class CoreInteractor {
  readonly techniker: TechnikerInteractor;
  readonly termine: TermineInteractor;
  readonly anfragen: AnfragenInteractor;
  readonly routen: RoutenInteractor;
  readonly system: SystemInteractor;

  constructor(readonly api: ApiService = new ApiService()) {
    this.techniker = new TechnikerInteractor(api);
    this.termine = new TermineInteractor(api);
    this.anfragen = new AnfragenInteractor(api);
    this.routen = new RoutenInteractor(api);
    this.system = new SystemInteractor(api);
  }

  // ---------- modulübergreifendes Lesen ----------

  /** Plan-Status je Anfrage mit Kurznamen der Person („Mo 23.11. · Nord“) */
  requestStatuses(plan: Plan): Map<string, RequestPlanStatus> {
    return this.routen.requestStatuses(plan, (id) => this.techniker.getShortName(id));
  }

  // ---------- Schreiben: ausführen, dann alles Sichtbare aktualisieren ----------

  approveRoute(technicianId: string, date: string, currentlyApproved: boolean) {
    return this.mutate(() => this.routen.setApproval([this.routen.routeKey(technicianId, date)], !currentlyApproved));
  }

  approveDay(date: string) {
    return this.mutate(() => this.routen.approveDay(date));
  }

  confirmNote(requestId: string, constraint: NoteConstraint | null) {
    return this.mutate(() => this.anfragen.confirmNote(requestId, constraint));
  }

  decideRequest(requestId: string, input: DecisionInput | null) {
    return this.mutate(() => this.anfragen.decide(requestId, input));
  }

  escalateRequest(requestId: string, input: EscalationInput) {
    return this.mutate(() => this.anfragen.escalate(requestId, input));
  }

  withdrawRequestEscalation(requestId: string) {
    return this.mutate(() => this.anfragen.withdrawEscalation(requestId));
  }

  escalateTechnician(technicianId: string, target: EscalationTarget, input: TechnicianEscalationInput) {
    return this.mutate(() => this.techniker.escalate(technicianId, target, input));
  }

  withdrawTechnicianEscalation(technicianId: string, target: EscalationTarget) {
    return this.mutate(() => this.techniker.withdrawEscalation(technicianId, target));
  }

  /** Datenkorrektur aus der Bearbeiten-Ansicht – an das zuständige Modul */
  updateEntity(key: EntityKey, id: string, changes: Record<string, string>) {
    return this.mutate(() => this.moduleFor(key).update(id, changes));
  }

  resetEntity(key: EntityKey, id: string) {
    return this.mutate(() => this.moduleFor(key).resetToOriginal(id));
  }

  resetPlanning() {
    return this.mutate(() => this.system.resetPlanning());
  }

  /** Heizma-Daten neu laden und neu planen */
  reloadAll() {
    return this.mutate(() => this.system.reloadSource());
  }

  // ---------- intern ----------

  private moduleFor(key: EntityKey) {
    return key === 'technicians' ? this.techniker : key === 'appointments' ? this.termine : this.anfragen;
  }

  private resources(): Resource<unknown>[] {
    return [
      ...this.techniker.resources(),
      ...this.termine.resources(),
      ...this.anfragen.resources(),
      ...this.routen.resources(),
      ...this.system.resources(),
    ] as Resource<unknown>[];
  }

  /** Lädt alle Resources neu, die gerade angezeigt werden. Nicht angezeigte laden beim nächsten Öffnen. */
  async refreshActive(): Promise<void> {
    await Promise.all(this.resources().filter((r) => r.active).map((r) => r.load()));
  }

  private async mutate<T>(action: () => Promise<T>): Promise<T> {
    const result = await action(); // ApiService.send leert den Cache
    await this.refreshActive();
    return result;
  }
}
