/**
 * @file      Resource.ts – Beobachtbarer Ladezustand (wie ObservableObject in Swift)
 * @layer     Web · Core
 * @siehe     docs/02-architektur.md · docs/10-code-navigation.md
 */
/**
 * Resource – beobachtbarer Ladezustand für einen Datensatz (wie ein ObservableObject in Swift).
 *
 * Ein Interactor hält seine Daten in Resources. Views abonnieren sie über `useResource`
 * und rendern neu, sobald sich `data`, `error` oder `loading` ändert. Mehrere Views teilen
 * sich dieselbe Instanz → nach einer Änderung sind alle gleichzeitig aktuell.
 */

export interface ResourceState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
}

type Listener = () => void;

export class Resource<T> {
  private state: ResourceState<T> = { data: null, error: null, loading: false };
  private listeners = new Set<Listener>();
  /** Nur die jüngste Ladeanfrage darf den Zustand setzen */
  private seq = 0;

  constructor(private readonly fetcher: () => Promise<T>) {}

  getState = (): ResourceState<T> => this.state;

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /** Wird gerade von mindestens einer View angezeigt */
  get active(): boolean {
    return this.listeners.size > 0;
  }

  /** Lädt (bzw. holt aus dem ApiService-Cache). Gibt die Daten zurück oder null bei Fehler. */
  async load(): Promise<T | null> {
    const id = ++this.seq;
    this.set({ loading: true, error: null });
    try {
      const data = await this.fetcher();
      if (id === this.seq) this.set({ data, loading: false });
      return data;
    } catch (e) {
      if (id === this.seq) this.set({ error: (e as Error).message, loading: false });
      return null;
    }
  }

  /** Daten von außen setzen (z. B. Stand aus einer Schreib-Antwort) – verwirft laufende Ladeanfragen */
  prime(data: T) {
    this.seq++;
    this.set({ data, error: null, loading: false });
  }

  private set(patch: Partial<ResourceState<T>>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l());
  }
}

/** Resources mit Parameter (z. B. Planung je Anfrage-ID) – eine stabile Instanz pro Schlüssel */
export class ResourceFamily<K, T> {
  private items = new Map<K, Resource<T>>();

  constructor(private readonly fetcher: (key: K) => Promise<T>) {}

  get(key: K): Resource<T> {
    let r = this.items.get(key);
    if (!r) {
      r = new Resource(() => this.fetcher(key));
      this.items.set(key, r);
    }
    return r;
  }

  all(): Resource<T>[] {
    return [...this.items.values()];
  }
}
