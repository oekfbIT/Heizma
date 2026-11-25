import GoogleRouteMap from './GoogleRouteMap';
import LeafletRouteMap, { type RouteMapProps } from './LeafletRouteMap';

/**
 * Wählt die Kartenquelle:
 * - VITE_GOOGLE_MAPS_API_KEY gesetzt → Google Maps
 * - sonst Leaflet mit freien Kacheln (funktioniert ohne Key)
 */
const hasGoogleKey = Boolean(import.meta.env.VITE_GOOGLE_MAPS_API_KEY);

export default function RouteMap(props: RouteMapProps) {
  return hasGoogleKey ? <GoogleRouteMap {...props} /> : <LeafletRouteMap {...props} />;
}
