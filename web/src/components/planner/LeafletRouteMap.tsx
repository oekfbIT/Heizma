import polyline from '@mapbox/polyline';
import L from 'leaflet';
import { useEffect, useMemo, useRef } from 'react';
import { MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap } from 'react-leaflet';
import type { RouteGeometry } from '@/lib/api';
import type { DayRoute, Technician } from '@/lib/types';
import StopPopover from './StopPopover';

export interface RouteMapProps {
  routes: DayRoute[]; // Routen des gewählten Tages
  technicians: Technician[];
  colors: Record<string, string>;
  selectedId: string | null;
  geometry: RouteGeometry | null; // Straßenverlauf der ausgewählten Route
  office: { label: string; lat: number; lng: number } | null;
  hoveredStopId: string | null;
  onSelect: (technicianId: string) => void;
  onHoverStop: (stopId: string | null) => void;
  /** Ausgewählter Stopp: Karte zoomt hin, Popover bleibt offen */
  selectedStopId: string | null;
  onSelectStop: (technicianId: string, stopId: string | null) => void;
  onOpenDetails: (stopId: string) => void;
}


const AUSTRIA_BOUNDS = L.latLngBounds([46.4, 9.5], [49.0, 17.2]);

function stopIcon(label: string, color: string, active: boolean, fixed: boolean) {
  const size = active ? 34 : 28;
  return L.divIcon({
    className: 'marker-reset',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    // Fixer Termin = dunkles Quadrat mit Schloss · neu eingeplante Anfrage = Kreis in Technikerfarbe
    html: fixed
      ? `<div style="position:relative;width:${size}px;height:${size}px;background:#20242d;border:3px solid ${active ? '#66b55f' : '#fff'};border-radius:6px;box-shadow:0 2px 6px rgba(0,0,0,.3);display:flex;align-items:center;justify-content:center;color:#fff;font:600 12px Inter,sans-serif">${label}<span style="position:absolute;right:-8px;top:-8px;width:16px;height:16px;border-radius:9999px;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.3);display:flex;align-items:center;justify-content:center"><svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#20242d" stroke-width="3"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg></span></div>`
      : `<div style="width:${size}px;height:${size}px;background:${color};border:3px solid #fff;border-radius:9999px;box-shadow:0 2px 6px rgba(0,0,0,.3);display:flex;align-items:center;justify-content:center;color:#fff;font:600 12px Inter,sans-serif">${label}</div>`,
  });
}

function homeIcon(color: string, active: boolean) {
  const size = active ? 34 : 26;
  return L.divIcon({
    className: 'marker-reset',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html: `<div style="width:${size}px;height:${size}px;background:#fff;border:3px solid ${color};border-radius:8px;box-shadow:0 2px 6px rgba(0,0,0,.25);display:flex;align-items:center;justify-content:center"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.5"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg></div>`,
  });
}

const officeIcon = L.divIcon({
  className: 'marker-reset',
  iconSize: [30, 38],
  iconAnchor: [15, 36],
  html: `<svg width="30" height="38" viewBox="0 0 32 40"><path d="M16 1C16 1 3 16 3 24a13 13 0 0 0 26 0C29 16 16 1 16 1z" fill="#4DA547" stroke="#fff" stroke-width="2"/><text x="16" y="29" text-anchor="middle" font-family="Inter,sans-serif" font-size="11" font-weight="700" fill="#fff">H</text></svg>`,
});

/**
 * Kamera-Steuerung, ohne dem Nutzer die Karte "wegzuziehen":
 * neu einpassen nur bei geänderten Punkten (Tag/Techniker/Region/Plan), Stopp-Auswahl fliegt einmal hin.
 */
function MapFocus({ points, focus }: { points: L.LatLngExpression[]; focus: [number, number] | null }) {
  const map = useMap();
  const pointsKey = points.map((p) => (p as [number, number]).map((v) => v.toFixed(5)).join(',')).join('|');
  const focusKey = focus ? focus.join(',') : null;
  const lastPoints = useRef<string | null>(null);

  useEffect(() => {
    if (lastPoints.current === pointsKey) return;
    lastPoints.current = pointsKey;
    if (points.length) map.flyToBounds(L.latLngBounds(points), { padding: [60, 60], maxZoom: 12, duration: 0.6 });
    else map.fitBounds(AUSTRIA_BOUNDS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, pointsKey]);

  useEffect(() => {
    if (!focus) return;
    map.flyTo(focus, Math.max(map.getZoom(), 13), { duration: 0.6 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, focusKey]);
  return null;
}

/** Google-Maps-ähnliche Kartenansicht der Tagesrouten */
export default function LeafletRouteMap(props: RouteMapProps & { tileUrl: string; attribution: string }) {
  const { routes, technicians, colors, selectedId, geometry, office, hoveredStopId, selectedStopId } = props;
  const techById = useMemo(() => new Map(technicians.map((t) => [t.id, t])), [technicians]);
  const visible = selectedId ? routes.filter((r) => r.technicianId === selectedId) : routes;

  // Bounds: gewählte Route bzw. alle Routen des Tages
  const boundsPoints = useMemo(() => {
    const pts: L.LatLngExpression[] = [];
    visible.forEach((r) => {
      const t = techById.get(r.technicianId);
      if (t) pts.push([t.home.lat, t.home.lng]);
      r.stops.forEach((s) => pts.push([s.lat, s.lng]));
    });
    return pts;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, routes, techById]);

  const focusStop = selectedStopId ? visible.flatMap((r) => r.stops).find((s) => s.id === selectedStopId) : null;

  function linePoints(route: DayRoute): L.LatLngExpression[][] {
    const tech = techById.get(route.technicianId);
    if (!tech) return [];
    // Echte Straßengeometrie, wenn vorhanden (nur für die gewählte Route geladen)
    if (geometry && route.technicianId === selectedId && geometry.legs.some((l) => l.polyline)) {
      return geometry.legs.map((leg, i) =>
        leg.polyline
          ? (polyline.decode(leg.polyline) as L.LatLngExpression[])
          : [
              [geometry.points[i].lat, geometry.points[i].lng],
              [geometry.points[i + 1].lat, geometry.points[i + 1].lng],
            ],
      );
    }
    const pts: L.LatLngExpression[] = [[tech.home.lat, tech.home.lng], ...route.stops.map((s) => [s.lat, s.lng] as L.LatLngExpression), [tech.home.lat, tech.home.lng]];
    return [pts];
  }

  return (
    <MapContainer bounds={AUSTRIA_BOUNDS} className="h-full w-full" zoomControl={false} attributionControl>
      <TileLayer
        attribution={props.attribution}
        url={props.tileUrl}
      />
      <MapFocus points={boundsPoints} focus={focusStop ? [focusStop.lat, focusStop.lng] : null} />

      {routes.map((route) => {
        const color = colors[route.technicianId];
        const active = route.technicianId === selectedId;
        return linePoints(route).map((pts, i) => (
          <Polyline
            key={`${route.technicianId}-${i}`}
            positions={pts}
            pathOptions={{ color, weight: active ? 5 : 3, opacity: selectedId && !active ? 0.25 : 0.85, dashArray: geometry && active ? undefined : active ? undefined : '6 6' }}
            eventHandlers={{ click: () => props.onSelect(route.technicianId) }}
          />
        ));
      })}

      {/* Wohnorte (Start/Ende jeder Route) */}
      {technicians.map((t) => {
        const hasRoute = routes.some((r) => r.technicianId === t.id);
        const dimmed = !!selectedId && t.id !== selectedId;
        return (
          <Marker
            key={t.id}
            position={[t.home.lat, t.home.lng]}
            icon={homeIcon(colors[t.id] ?? '#9ca3af', t.id === selectedId)}
            opacity={dimmed ? 0.35 : hasRoute ? 1 : 0.5}
            eventHandlers={{ click: () => props.onSelect(t.id) }}
          >
            <Tooltip direction="top" offset={[0, -14]} className="stop-tooltip">
              <strong>{t.name}</strong>
              <br />
              Start & Ende: {t.home.label}
            </Tooltip>
          </Marker>
        );
      })}

      {/* Stopps – andere Techniker blass, Klick wechselt dorthin */}
      {routes.map((route) =>
        route.stops.map((stop, idx) => {
          const dimmed = !!selectedId && route.technicianId !== selectedId;
          const selected = selectedStopId === stop.id;
          return (
            <Marker
              key={`${route.technicianId}-${stop.id}-${selected}`}
              position={[stop.lat, stop.lng]}
              icon={stopIcon(String(idx + 1), colors[route.technicianId], selected || hoveredStopId === stop.id, stop.fixed)}
              opacity={dimmed && hoveredStopId !== stop.id ? 0.4 : 1}
              zIndexOffset={selected ? 2000 : hoveredStopId === stop.id ? 1000 : dimmed ? -500 : 0}
              eventHandlers={{
                click: () => props.onSelectStop(route.technicianId, stop.id),
                mouseover: () => props.onHoverStop(stop.id),
                mouseout: () => props.onHoverStop(null),
              }}
            >
              {selected ? (
                <Tooltip permanent interactive direction="top" offset={[0, -18]} className="stop-tooltip stop-popover">
                  <StopPopover
                    stop={stop}
                    index={idx}
                    color={colors[route.technicianId]}
                    onDetails={() => props.onOpenDetails(stop.id)}
                    onClose={() => props.onSelectStop(route.technicianId, null)}
                  />
                </Tooltip>
              ) : (
                <Tooltip direction="top" offset={[0, -14]} className="stop-tooltip">
                  <strong>
                    {idx + 1}. {stop.customer}
                  </strong>
                  <br />
                  {stop.start}–{stop.end} · Klick für Details
                </Tooltip>
              )}
            </Marker>
          );
        }),
      )}

      {office && (
        <Marker position={[office.lat, office.lng]} icon={officeIcon}>
          <Tooltip direction="top" offset={[0, -34]} className="stop-tooltip">
            {office.label}
          </Tooltip>
        </Marker>
      )}
    </MapContainer>
  );
}
