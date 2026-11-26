import type { Stammdaten } from '@/modules';

/** Grobe Ortsreferenzen (AT + Grenzregionen) – damit Eckpunkte ohne Geocoding lesbar sind */
const TOWNS: [string, number, number][] = [
  ['Wien', 48.2082, 16.3738], ['St. Pölten', 48.2047, 15.6256], ['Wiener Neustadt', 47.8151, 16.2465],
  ['Krems', 48.4106, 15.6141], ['Baden', 48.0069, 16.2309], ['Mödling', 48.0856, 16.2833],
  ['Tulln', 48.3294, 16.0583], ['Mistelbach', 48.57, 16.5766], ['Hollabrunn', 48.5626, 16.0791],
  ['Zwettl', 48.6033, 15.1686], ['Gmünd', 48.7697, 14.9842], ['Amstetten', 48.1229, 14.8722],
  ['Bruck/Leitha', 48.0263, 16.7792], ['Neusiedl am See', 47.9486, 16.8413], ['Eisenstadt', 47.8457, 16.5232],
  ['Oberwart', 47.2878, 16.2031], ['Jennersdorf', 46.9386, 16.1405], ['Graz', 47.0707, 15.4395],
  ['Leoben', 47.3765, 15.0914], ['Bruck/Mur', 47.4106, 15.2686], ['Liezen', 47.5667, 14.2397],
  ['Judenburg', 47.1724, 14.6602], ['Leibnitz', 46.7831, 15.5436], ['Hartberg', 47.2804, 15.97],
  ['Klagenfurt', 46.6365, 14.3122], ['Villach', 46.6111, 13.8558], ['Spittal/Drau', 46.8, 13.4953],
  ['Wolfsberg', 46.8406, 14.8442], ['Linz', 48.3069, 14.2858], ['Wels', 48.166, 14.0333],
  ['Steyr', 48.0427, 14.4213], ['Freistadt', 48.5114, 14.5047], ['Ried i. I.', 48.21, 13.4886],
  ['Braunau', 48.2567, 13.0347], ['Gmunden', 47.9186, 13.7994], ['Vöcklabruck', 48.0086, 13.6556],
  ['Schärding', 48.4569, 13.4317], ['Salzburg', 47.8095, 13.055], ['Hallein', 47.6833, 13.1],
  ['Bischofshofen', 47.4172, 13.2194], ['Zell am See', 47.3236, 12.7967], ['Innsbruck', 47.2692, 11.4041],
  ['Kufstein', 47.5833, 12.1667], ['Kitzbühel', 47.4464, 12.3922], ['Schwaz', 47.35, 11.7], ['Lienz', 46.8289, 12.7694],
  ['Imst', 47.245, 10.7397], ['Landeck', 47.1393, 10.5658], ['Reutte', 47.4833, 10.7167],
  ['Bregenz', 47.5031, 9.7471], ['Feldkirch', 47.2378, 9.5983], ['Bludenz', 47.1547, 9.8219],
  ['Kempten (DE)', 47.7286, 10.3158], ['Garmisch (DE)', 47.4917, 11.0955], ['Rosenheim (DE)', 47.8561, 12.1289],
  ['Bad Reichenhall (DE)', 47.7253, 12.8778], ['Passau (DE)', 48.5667, 13.4319], ['Bozen (IT)', 46.4983, 11.3548],
  ['Brixen (IT)', 46.7158, 11.6564], ['Meran (IT)', 46.6713, 11.1525], ['Bratislava (SK)', 48.1486, 17.1077],
  ['Sopron (HU)', 47.6817, 16.5845], ['Maribor (SI)', 46.5547, 15.6459], ['Budweis (CZ)', 48.9745, 14.4744],
];

function km(aLat: number, aLng: number, bLat: number, bLng: number) {
  const r = Math.PI / 180;
  const x = (bLng - aLng) * r * Math.cos(((aLat + bLat) / 2) * r);
  const y = (bLat - aLat) * r;
  return Math.sqrt(x * x + y * y) * 6371;
}

/** Ort aus "Straße 1, 1100 Wien" → "1100 Wien" */
const cityOf = (address: string) => address.split(',').pop()!.trim();

export function placeIndex(d?: Stammdaten): [string, number, number][] {
  const extra: [string, number, number][] = [];
  for (const t of d?.technicians ?? []) extra.push([t.home.label, t.home.lat, t.home.lng]);
  return [...TOWNS, ...extra];
}

/** "≈ Kempten (DE) · 3 km" – nächstgelegener bekannter Ort */
export function nearestPlace(lat: number, lng: number, places: [string, number, number][]) {
  let best = places[0];
  let bestKm = Infinity;
  for (const p of places) {
    const dist = km(lat, lng, p[1], p[2]);
    if (dist < bestKm) [best, bestKm] = [p, dist];
  }
  if (!best) return '';
  return bestKm < 2 ? best[0] : `≈ ${best[0]} · ${Math.round(bestKm)} km`;
}

export { cityOf };
