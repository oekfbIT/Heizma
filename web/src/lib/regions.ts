import { useSearchParams } from 'react-router-dom';
import type { Stammdaten } from './api';
import type { Technician } from './types';

/** Ein Techniker = ein Einsatzgebiet. "Techniker Ost" → "Ost" */
export const regionLabel = (t: Technician) => t.name.replace(/^Techniker\s+/i, '');

export const NO_REGION = 'ohne';

/** Regionsfilter in der URL (?region=tech_01) – bleibt beim Wechsel zwischen Seiten erhalten */
export function useRegion(): [string, (value: string) => void] {
  const [params, setParams] = useSearchParams();
  const region = params.get('region') ?? '';
  const setRegion = (value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set('region', value);
    else next.delete('region');
    setParams(next, { replace: true });
  };
  return [region, setRegion];
}

/** Gehört die Anfrage zur gewählten Region? */
export function requestInRegion(d: Stammdaten, requestId: string, region: string): boolean {
  if (!region) return true;
  const techs = d.responsibility?.[requestId] ?? [];
  return region === NO_REGION ? techs.length === 0 : techs.includes(region);
}

/** Link-Ziel mit aktuellem Regionsfilter */
export const withRegion = (path: string, region: string) => (region ? `${path}?region=${region}` : path);
