/**
 * @file      towns.ts – Offline-Ortsverzeichnis AT – letzter Geocoding-Fallback (Ortsmitte)
 * @layer     Backend · Daten
 * @siehe     docs/04-datenqualitaet.md · docs/10-code-navigation.md
 */
/**
 * Offline-Ortsverzeichnis (Bezirkshauptorte & größere Gemeinden in AT).
 * Letzter Fallback fürs Geocoding, wenn Google/OSM nicht erreichbar sind → Ortsmitte.
 * [Name, PLZ, lat, lng]
 */
export const TOWNS: [string, string, number, number][] = [
  ['Wien', '1010', 48.2082, 16.3738], ['St. Pölten', '3100', 48.2047, 15.6256], ['Wiener Neustadt', '2700', 47.8151, 16.2465],
  ['Krems an der Donau', '3500', 48.4106, 15.6141], ['Baden', '2500', 48.0069, 16.2309], ['Mödling', '2340', 48.0856, 16.2833],
  ['Tulln an der Donau', '3430', 48.3294, 16.0583], ['Mistelbach', '2130', 48.57, 16.5766], ['Hollabrunn', '2020', 48.5626, 16.0791],
  ['Stockerau', '2000', 48.3858, 16.2108], ['Korneuburg', '2100', 48.3453, 16.3331], ['Gänserndorf', '2230', 48.3392, 16.7203],
  ['Horn', '3580', 48.6628, 15.6566], ['Zwettl', '3910', 48.6033, 15.1686], ['Gmünd', '3950', 48.7697, 14.9842],
  ['Waidhofen an der Thaya', '3830', 48.8167, 15.2833], ['Melk', '3390', 48.2269, 15.3436], ['Amstetten', '3300', 48.1229, 14.8722],
  ['Scheibbs', '3270', 48.0, 15.1667], ['Lilienfeld', '3180', 48.0136, 15.5964], ['Neunkirchen', '2620', 47.7269, 16.0817],
  ['Bruck an der Leitha', '2460', 48.0263, 16.7792], ['Schwechat', '2320', 48.1411, 16.4786], ['Klosterneuburg', '3400', 48.3053, 16.3253],
  ['Perchtoldsdorf', '2380', 48.1194, 16.2661], ['Traiskirchen', '2514', 48.0186, 16.2922], ['Waidhofen an der Ybbs', '3340', 47.9606, 14.7744],
  ['Eisenstadt', '7000', 47.8457, 16.5232], ['Neusiedl am See', '7100', 47.9486, 16.8413], ['Mattersburg', '7210', 47.7372, 16.3967],
  ['Oberpullendorf', '7350', 47.5036, 16.5042], ['Oberwart', '7400', 47.2878, 16.2031], ['Güssing', '7540', 47.0583, 16.3236],
  ['Jennersdorf', '8380', 46.9386, 16.1405], ['Graz', '8010', 47.0707, 15.4395], ['Leoben', '8700', 47.3765, 15.0914],
  ['Bruck an der Mur', '8600', 47.4106, 15.2686], ['Kapfenberg', '8605', 47.4447, 15.2931], ['Liezen', '8940', 47.5667, 14.2397],
  ['Judenburg', '8750', 47.1724, 14.6602], ['Knittelfeld', '8720', 47.2147, 14.8292], ['Murau', '8850', 47.1103, 14.1708],
  ['Leibnitz', '8430', 46.7831, 15.5436], ['Hartberg', '8230', 47.2804, 15.97], ['Weiz', '8160', 47.2186, 15.6253],
  ['Gleisdorf', '8200', 47.1036, 15.7083], ['Feldbach', '8330', 46.9531, 15.8886], ['Deutschlandsberg', '8530', 46.8156, 15.2228],
  ['Voitsberg', '8570', 47.0444, 15.1494], ['Klagenfurt', '9020', 46.6365, 14.3122], ['Villach', '9500', 46.6111, 13.8558],
  ['Spittal an der Drau', '9800', 46.8, 13.4953], ['Wolfsberg', '9400', 46.8406, 14.8442], ['St. Veit an der Glan', '9300', 46.7681, 14.3603],
  ['Feldkirchen in Kärnten', '9560', 46.7239, 14.0953], ['Völkermarkt', '9100', 46.6622, 14.6347], ['Hermagor', '9620', 46.6269, 13.3672],
  ['Linz', '4020', 48.3069, 14.2858], ['Wels', '4600', 48.166, 14.0333], ['Steyr', '4400', 48.0427, 14.4213],
  ['Leonding', '4060', 48.2603, 14.2528], ['Traun', '4050', 48.2214, 14.2397], ['Enns', '4470', 48.2133, 14.4753],
  ['Freistadt', '4240', 48.5114, 14.5047], ['Perg', '4320', 48.25, 14.6333], ['Rohrbach', '4150', 48.5717, 13.9886],
  ['Eferding', '4070', 48.3089, 14.0228], ['Grieskirchen', '4710', 48.235, 13.8314], ['Ried im Innkreis', '4910', 48.21, 13.4886],
  ['Braunau am Inn', '5280', 48.2567, 13.0347], ['Schärding', '4780', 48.4569, 13.4317], ['Vöcklabruck', '4840', 48.0086, 13.6556],
  ['Gmunden', '4810', 47.9186, 13.7994], ['Kirchdorf an der Krems', '4560', 47.905, 14.1222], ['Bad Ischl', '4820', 47.7111, 13.6239],
  ['Salzburg', '5020', 47.8095, 13.055], ['Hallein', '5400', 47.6833, 13.1], ['Bischofshofen', '5500', 47.4172, 13.2194],
  ['St. Johann im Pongau', '5600', 47.3497, 13.2025], ['Zell am See', '5700', 47.3236, 12.7967], ['Tamsweg', '5580', 47.1281, 13.8106],
  ['Seekirchen', '5201', 47.9, 13.1333], ['Innsbruck', '6020', 47.2692, 11.4041], ['Hall in Tirol', '6060', 47.2833, 11.5],
  ['Schwaz', '6130', 47.35, 11.7], ['Wörgl', '6300', 47.4894, 12.0617], ['Kufstein', '6330', 47.5833, 12.1667],
  ['Kitzbühel', '6370', 47.4464, 12.3922], ['St. Johann in Tirol', '6380', 47.5228, 12.4239], ['Lienz', '9900', 46.8289, 12.7694],
  ['Telfs', '6410', 47.3069, 11.0722], ['Imst', '6460', 47.245, 10.7397], ['Landeck', '6500', 47.1393, 10.5658],
  ['Reutte', '6600', 47.4833, 10.7167], ['Bregenz', '6900', 47.5031, 9.7471], ['Dornbirn', '6850', 47.4125, 9.7417],
  ['Feldkirch', '6800', 47.2378, 9.5983], ['Bludenz', '6700', 47.1547, 9.8219], ['Hohenems', '6845', 47.3667, 9.6833],
];

const norm = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

/** "3580 Horn" → Horn. Sucht nach PLZ, dann nach Ortsname (auch Teilstring, Tippfehler-tolerant über Präfix). */
export function findTown(townPart: string) {
  const plz = townPart.match(/\b\d{4}\b/)?.[0];
  const name = norm(townPart.replace(/\b\d{4}\b/, ''));
  return (
    (plz && TOWNS.find((t) => t[1] === plz)) ||
    (name && TOWNS.find((t) => norm(t[0]) === name)) ||
    (name && TOWNS.find((t) => norm(t[0]).startsWith(name) || name.startsWith(norm(t[0])))) ||
    (name.length >= 4 && TOWNS.find((t) => norm(t[0]).slice(0, 4) === name.slice(0, 4))) ||
    undefined
  );
}

export function nearestTown(lat: number, lng: number) {
  const r = Math.PI / 180;
  let best = TOWNS[0], bestKm = Infinity;
  for (const t of TOWNS) {
    const x = (t[3] - lng) * r * Math.cos(((lat + t[2]) / 2) * r), y = (t[2] - lat) * r;
    const km = Math.sqrt(x * x + y * y) * 6371;
    if (km < bestKm) [best, bestKm] = [t, km];
  }
  return { town: best, km: bestKm };
}
