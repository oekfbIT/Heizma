import { useCallback, useEffect, useSyncExternalStore } from 'react';
import type { Resource, ResourceState } from './Resource';

const EMPTY: ResourceState<never> = { data: null, error: null, loading: false };
const noopSubscribe = () => () => {};
const emptyState = () => EMPTY;

/**
 * View-Seite einer Resource: abonniert den Zustand und lädt beim ersten Anzeigen.
 * `null` heißt „nicht benötigt“ (z. B. Plan nur in der Anfragen-Liste).
 */
export function useResource<T>(resource: Resource<T> | null): ResourceState<T> & { reload: () => void } {
  const state = useSyncExternalStore(resource ? resource.subscribe : noopSubscribe, resource ? resource.getState : emptyState);

  useEffect(() => {
    void resource?.load();
  }, [resource]);

  const reload = useCallback(() => {
    void resource?.load();
  }, [resource]);

  return { ...(state as ResourceState<T>), reload };
}
