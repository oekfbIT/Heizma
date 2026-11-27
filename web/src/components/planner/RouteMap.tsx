/**
 * @file      RouteMap.tsx – Karte (Google Maps). Key kommt zur Laufzeit von /api/config
 * @layer     Web · View-Komponente (Karte)
 * @siehe     docs/09-setup.md · docs/10-code-navigation.md
 */
import { useCore, useResource } from '@/core';
import GoogleRouteMap, { type RouteMapProps } from './GoogleRouteMap';

/** Google Maps, sobald GOOGLE_MAPS_API_KEY gesetzt ist – sonst ein klarer Hinweis statt einer leeren Fläche */
export default function RouteMap(props: RouteMapProps) {
  const { data } = useResource(useCore().system.config);
  if (!data) return <div className="h-full w-full bg-gray-100" />;
  const map = data.map;
  if (!map.googleMapsApiKey)
    return (
      <div className="flex h-full w-full items-center justify-center bg-gray-100 p-6 text-center text-sm text-gray-500">
        Karte nicht verfügbar: GOOGLE_MAPS_API_KEY in der .env setzen. Routen und Zeiten stehen links.
      </div>
    );
  return (
    <div className="relative h-full w-full">
      <GoogleRouteMap {...props} apiKey={map.googleMapsApiKey} mapId={map.googleMapsMapId} />
    </div>
  );
}
