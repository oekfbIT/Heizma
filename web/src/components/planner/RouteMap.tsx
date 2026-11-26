/**
 * @file      RouteMap.tsx – Wählt zur Laufzeit die Kartenquelle (Google oder Leaflet)
 * @layer     Web · View-Komponente (Karte)
 * @siehe     docs/09-setup.md · docs/10-code-navigation.md
 */
import { useCore, useResource } from '@/core';
import GoogleRouteMap from './GoogleRouteMap';
import LeafletRouteMap, { type RouteMapProps } from './LeafletRouteMap';

/**
 * Wählt die Kartenquelle (Konfiguration kommt zur Laufzeit von /api/config):
 * - GOOGLE_MAPS_API_KEY gesetzt → Google Maps
 * - sonst Leaflet mit freien Kacheln (funktioniert ohne Key)
 */
export default function RouteMap(props: RouteMapProps) {
  const { data } = useResource(useCore().system.config);
  if (!data) return <div className="h-full w-full bg-gray-100" />;
  const map = data.map;
  return (
    <div className="relative h-full w-full">
      {map.googleMapsApiKey ? (
        <GoogleRouteMap {...props} apiKey={map.googleMapsApiKey} mapId={map.googleMapsMapId} />
      ) : (
        <LeafletRouteMap {...props} tileUrl={map.tileUrl} attribution={map.attribution} />
      )}
    </div>
  );
}
