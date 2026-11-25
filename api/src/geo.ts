import type { LatLng } from './types.js';

const EARTH_RADIUS_KM = 6371;

/** Luftlinie in km (Haversine) */
export function haversineKm(a: LatLng, b: LatLng): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

/**
 * Grobe Fahrzeit-Schätzung für die Vorplanung (ohne API-Calls):
 * Luftlinie × 1,3 Umwegfaktor bei Ø 65 km/h + 5 min Parken/Anfahrt.
 * Wird später durch die Fahrzeitmatrix aus /travel ersetzt.
 */
export function estimateTravelMinutes(a: LatLng, b: LatLng): number {
  const km = haversineKm(a, b) * 1.3;
  if (km < 0.05) return 0;
  return Math.round((km / 65) * 60 + 5);
}

/** Punkt-in-Polygon (Ray Casting). Polygon gilt als geschlossen. */
export function pointInPolygon(point: LatLng, polygon: LatLng[]): boolean {
  if (polygon.length < 3) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lng;
    const yi = polygon[i].lat;
    const xj = polygon[j].lng;
    const yj = polygon[j].lat;
    const intersects =
      yi > point.lat !== yj > point.lat && point.lng < ((xj - xi) * (point.lat - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

export function hasCoords(x: { lat: number | null; lng: number | null }): x is LatLng {
  return typeof x.lat === 'number' && typeof x.lng === 'number';
}
