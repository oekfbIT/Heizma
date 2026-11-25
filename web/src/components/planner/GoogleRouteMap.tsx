import polyline from '@mapbox/polyline';
import { AdvancedMarker, APIProvider, Map, useMap } from '@vis.gl/react-google-maps';
import { useEffect, useMemo } from 'react';
import type { DayRoute } from '@/lib/types';
import type { RouteMapProps } from './LeafletRouteMap';

/**
 * Kartenansicht mit Google Maps (Maps JavaScript API).
 * Aktiv, sobald GOOGLE_MAPS_API_KEY in der .env gesetzt ist (kommt über /api/config).
 */

// Advanced Markers brauchen eine Map-ID. DEMO_MAP_ID funktioniert für Entwicklung.
const AUSTRIA_CENTER = { lat: 47.7, lng: 14.5 };

type LatLng = { lat: number; lng: number };

/** Zeichnet Linien imperativ (vis.gl hat keine Polyline-Komponente) */
function RouteLines({ lines }: { lines: { path: LatLng[]; color: string; weight: number; opacity: number; dashed: boolean; onClick: () => void }[] }) {
  const map = useMap();
  useEffect(() => {
    if (!map) return;
    const created = lines.map((l) => {
      const dash = { path: 'M 0,-1 0,1', strokeOpacity: l.opacity, scale: l.weight };
      const line = new google.maps.Polyline({
        map,
        path: l.path,
        strokeColor: l.color,
        strokeWeight: l.weight,
        strokeOpacity: l.dashed ? 0 : l.opacity,
        icons: l.dashed ? [{ icon: dash, offset: '0', repeat: '14px' }] : undefined,
        clickable: true,
      });
      line.addListener('click', l.onClick);
      return line;
    });
    return () => created.forEach((line) => line.setMap(null));
  }, [map, lines]);
  return null;
}

function FitBounds({ points }: { points: LatLng[] }) {
  const map = useMap();
  useEffect(() => {
    if (!map) return;
    if (!points.length) {
      map.setCenter(AUSTRIA_CENTER);
      map.setZoom(7);
      return;
    }
    const bounds = new google.maps.LatLngBounds();
    points.forEach((p) => bounds.extend(p));
    map.fitBounds(bounds, 70);
    // Bei nur einem Punkt nicht zu weit reinzoomen
    google.maps.event.addListenerOnce(map, 'idle', () => {
      if ((map.getZoom() ?? 0) > 12) map.setZoom(12);
    });
  }, [map, points]);
  return null;
}

function Tooltip({ children }: { children: React.ReactNode }) {
  return (
    <div className="pointer-events-none absolute bottom-full left-1/2 mb-2 w-max max-w-[260px] -translate-x-1/2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-left text-xs font-normal leading-snug text-ink shadow-lg">
      {children}
    </div>
  );
}

export default function GoogleRouteMap(props: RouteMapProps & { apiKey: string; mapId: string }) {
  const { routes, technicians, colors, selectedId, geometry, office, hoveredStopId } = props;
  const techById = useMemo(() => new globalThis.Map(technicians.map((t) => [t.id, t])), [technicians]);
  const visible = selectedId ? routes.filter((r) => r.technicianId === selectedId) : routes;

  const boundsPoints = useMemo(() => {
    const pts: LatLng[] = [];
    visible.forEach((r) => {
      const t = techById.get(r.technicianId);
      if (t) pts.push({ lat: t.home.lat, lng: t.home.lng });
      r.stops.forEach((s) => pts.push({ lat: s.lat, lng: s.lng }));
    });
    return pts;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, routes, techById]);

  const lines = useMemo(() => {
    const out: { path: LatLng[]; color: string; weight: number; opacity: number; dashed: boolean; onClick: () => void }[] = [];
    const pathsFor = (route: DayRoute): LatLng[][] => {
      const tech = techById.get(route.technicianId);
      if (!tech) return [];
      if (geometry && route.technicianId === selectedId && geometry.legs.some((l) => l.polyline)) {
        return geometry.legs.map((leg, i) =>
          leg.polyline
            ? polyline.decode(leg.polyline).map(([lat, lng]) => ({ lat, lng }))
            : [geometry.points[i], geometry.points[i + 1]],
        );
      }
      return [[tech.home, ...route.stops.map((s) => ({ lat: s.lat, lng: s.lng })), tech.home].map((p) => ({ lat: p.lat, lng: p.lng }))];
    };
    visible.forEach((route) => {
      const active = route.technicianId === selectedId;
      const hasRoadGeometry = active && !!geometry?.legs.some((l) => l.polyline);
      pathsFor(route).forEach((path) =>
        out.push({
          path,
          color: colors[route.technicianId],
          weight: active ? 5 : 3,
          opacity: selectedId && !active ? 0.3 : 0.9,
          dashed: !hasRoadGeometry && !active,
          onClick: () => props.onSelect(route.technicianId),
        }),
      );
    });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, geometry, selectedId, colors, techById]);

  return (
    <APIProvider apiKey={props.apiKey} language="de" region="AT">
      <Map
        mapId={props.mapId}
        defaultCenter={AUSTRIA_CENTER}
        defaultZoom={7}
        gestureHandling="greedy"
        disableDefaultUI
        zoomControl
        clickableIcons={false}
        className="h-full w-full"
      >
        <FitBounds points={boundsPoints} />
        <RouteLines lines={lines} />

        {/* Wohnorte */}
        {technicians.map((t) => {
          if (selectedId && t.id !== selectedId) return null;
          const color = colors[t.id] ?? '#9ca3af';
          const active = t.id === selectedId;
          const hasRoute = routes.some((r) => r.technicianId === t.id);
          return (
            <AdvancedMarker key={t.id} position={t.home} onClick={() => props.onSelect(t.id)} title={`${t.name} · ${t.home.label}`}>
              <div
                className="flex items-center justify-center rounded-lg border-[3px] bg-white shadow-md"
                style={{ borderColor: color, width: active ? 34 : 26, height: active ? 34 : 26, opacity: hasRoute ? 1 : 0.5 }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5">
                  <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                </svg>
              </div>
            </AdvancedMarker>
          );
        })}

        {/* Stopps */}
        {visible.map((route) =>
          route.stops.map((stop, idx) => {
            const hovered = hoveredStopId === stop.id;
            const size = hovered ? 34 : 28;
            return (
              <AdvancedMarker
                key={`${route.technicianId}-${stop.id}`}
                position={{ lat: stop.lat, lng: stop.lng }}
                zIndex={hovered ? 1000 : idx}
                onClick={() => props.onSelect(route.technicianId)}
                onMouseEnter={() => props.onHoverStop(stop.id)}
                onMouseLeave={() => props.onHoverStop(null)}
              >
                <div className="relative">
                  <div
                    className="flex items-center justify-center rounded-full border-[3px] border-white text-xs font-semibold text-white shadow-md transition-all"
                    style={{ width: size, height: size, background: stop.fixed ? '#20242d' : colors[route.technicianId] }}
                  >
                    {idx + 1}
                  </div>
                  {hovered && (
                    <Tooltip>
                      <strong>
                        {idx + 1}. {stop.customer}
                      </strong>
                      {stop.fixed && ' · fixer Termin'}
                      <br />
                      Ankunft {stop.arrival} · Termin {stop.start}–{stop.end}
                      {stop.waitMinutes > 0 && ` · ${stop.waitMinutes} min Wartezeit`}
                      <br />
                      <span className="text-gray-500">{stop.address}</span>
                    </Tooltip>
                  )}
                </div>
              </AdvancedMarker>
            );
          }),
        )}

        {office && (
          <AdvancedMarker position={office} title={office.label}>
            <svg width="30" height="38" viewBox="0 0 32 40">
              <path d="M16 1C16 1 3 16 3 24a13 13 0 0 0 26 0C29 16 16 1 16 1z" fill="#4DA547" stroke="#fff" strokeWidth="2" />
              <text x="16" y="29" textAnchor="middle" fontFamily="Inter,sans-serif" fontSize="11" fontWeight="700" fill="#fff">
                H
              </text>
            </svg>
          </AdvancedMarker>
        )}
      </Map>
    </APIProvider>
  );
}
