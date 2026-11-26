/**
 * @file      regions.ts – Regionsfilter (?region=) und Gebietsnamen
 * @layer     Web · Lib
 * @siehe     docs/02-architektur.md · docs/10-code-navigation.md
 */
import { useSearchParams } from 'react-router-dom';
import { NO_REGION, regionName } from '@/modules';

/** Ein Außendienstler = ein Einsatzgebiet. „Techniker Ost“ → „Ost“ */
export const regionLabel = regionName;
export { NO_REGION };

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

