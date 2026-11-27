/**
 * @file      GoogleRouteMap.tsx – Karte mit Google Maps (aktiv, wenn GOOGLE_MAPS_API_KEY gesetzt)
 * @layer     Web · View-Komponente (Karte)
 * @siehe     docs/09-setup.md · docs/10-code-navigation.md
 */
import polyline from '@mapbox/polyline';
import { AdvancedMarker, APIProvider, Map, useMap } from '@vis.gl/react-google-maps';
import { useEffect, useMemo, useRef } from 'react';
import type { RouteGeometry } from '@/modules';
import type { DayRoute, Technician } from '@/lib/types';
import { mapColors } from '@/ui';
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

/**
 * Kamera-Steuerung, ohne dem Nutzer die Karte "wegzuziehen":
 * - Neu einpassen nur, wenn sich die angezeigten Punkte wirklich ändern (Tag, Techniker, Region, Plan)
 * - Stopp gewählt → einmal hinfliegen; Popover schließen → Kamera bleibt, wo sie ist
 * - Hover, Re-Render oder Neuladen der Daten bewegen die Karte nicht
 */
function MapFocus({ points, focus }: { points: LatLng[]; focus: LatLng | null }) {
  const map = useMap();
  const pointsKey = points.map((p) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`).join('|');
  const focusKey = focus ? `${focus.lat},${focus.lng}` : null;
  const lastPoints = useRef<string | null>(null);

  // Ansicht gewechselt → alles einpassen
  useEffect(() => {
    if (!map || lastPoints.current === pointsKey) return;
    lastPoints.current = pointsKey;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, pointsKey]);

  // Stopp gewählt → hinfliegen (nur beim Wechsel der Auswahl)
  useEffect(() => {
    if (!map || !focus) return;
    map.panTo(focus);
    if ((map.getZoom() ?? 0) < 13) map.setZoom(13);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, focusKey]);
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
  const { routes, technicians, colors, selectedId, geometry, office, hoveredStopId, selectedStopId } = props;
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

  const focusStop = selectedStopId ? visible.flatMap((r) => r.stops).find((s) => s.id === selectedStopId) : null;

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
    // Alle Routen des Tages zeichnen; nicht gewählte nur blass → anklickbar zum Wechseln
    routes.forEach((route) => {
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
  }, [routes, geometry, selectedId, colors, techById]);

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
        <MapFocus points={boundsPoints} focus={focusStop ? { lat: focusStop.lat, lng: focusStop.lng } : null} />
        <RouteLines lines={lines} />

        {/* Wohnorte */}
        {technicians.map((t) => {
          const dimmed = !!selectedId && t.id !== selectedId;
          const color = colors[t.id] ?? mapColors().muted;
          const active = t.id === selectedId;
          const hasRoute = routes.some((r) => r.technicianId === t.id);
          return (
            <AdvancedMarker key={t.id} position={t.home} onClick={() => props.onSelect(t.id)} title={`${t.name} · ${t.home.label}`}>
              <div
                className="flex items-center justify-center rounded-lg border-[3px] bg-white shadow-md"
                style={{ borderColor: color, width: active ? 34 : 26, height: active ? 34 : 26, opacity: dimmed ? 0.35 : hasRoute ? 1 : 0.5 }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5">
                  <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                </svg>
              </div>
            </AdvancedMarker>
          );
        })}

        {/* Stopps – andere Techniker blass, Klick wechselt dorthin */}
        {routes.map((route) =>
          route.stops.map((stop, idx) => {
            const dimmed = !!selectedId && route.technicianId !== selectedId;
            const selected = selectedStopId === stop.id;
            const hovered = hoveredStopId === stop.id;
            const size = selected || hovered ? 34 : 28;
            return (
              <AdvancedMarker
                key={`${route.technicianId}-${stop.id}`}
                position={{ lat: stop.lat, lng: stop.lng }}
                zIndex={selected ? 2000 : hovered ? 1000 : idx}
                onClick={(e) => {
                  // Klicks im Popover (Details/Schließen) nicht als Marker-Klick werten
                  const target = (e as unknown as { domEvent?: Event }).domEvent?.target as HTMLElement | undefined;
                  if (target?.closest?.('[data-popover]')) return;
                  props.onSelectStop(route.technicianId, stop.id);
                }}
                onMouseEnter={() => props.onHoverStop(stop.id)}
                onMouseLeave={() => props.onHoverStop(null)}
              >
                <div className="relative transition-opacity" style={{ opacity: dimmed && !hovered ? 0.4 : 1 }}>
                  {stop.fixed ? (
                    /* Fixer Termin: dunkles Quadrat mit Schloss – nicht verschiebbar */
                    <div
                      className={`relative flex items-center justify-center rounded-md border-[3px] bg-ink text-xs font-semibold text-white shadow-md transition-all ${selected ? 'border-brand-400' : 'border-white'}`}
                      style={{ width: size, height: size }}
                    >
                      {idx + 1}
                      <span className="absolute -right-2 -top-2 flex h-4 w-4 items-center justify-center rounded-full bg-white shadow">
                        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" style={{ stroke: 'rgb(var(--color-ink))' }} strokeWidth="3"><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
                      </span>
                    </div>
                  ) : (
                    /* Neu eingeplante Anfrage: Kreis in Technikerfarbe */
                    <div
                      className={`flex items-center justify-center rounded-full border-[3px] text-xs font-semibold text-white shadow-md transition-all ${selected ? 'border-ink' : 'border-white'}`}
                      style={{ width: size, height: size, background: colors[route.technicianId] }}
                    >
                      {idx + 1}
                    </div>
                  )}
                  {selected ? (
                    <div data-popover className="absolute bottom-full left-1/2 mb-2 -translate-x-1/2 cursor-default rounded-xl border border-gray-200 bg-white p-3 shadow-xl">
                      <StopPopover
                        stop={stop}
                        index={idx}
                        color={colors[route.technicianId]}
                        onDetails={() => props.onOpenDetails(stop.id)}
                        onClose={() => props.onSelectStop(route.technicianId, null)}
                      />
                    </div>
                  ) : (
                    hovered && (
                      <Tooltip>
                        <strong>
                          {idx + 1}. {stop.customer}
                        </strong>
                        <br />
                        {stop.start}–{stop.end} · Klick für Details
                      </Tooltip>
                    )
                  )}
                </div>
              </AdvancedMarker>
            );
          }),
        )}

        {office && (
          <AdvancedMarker position={office} title={office.label}>
            <svg width="30" height="38" viewBox="0 0 32 40">
              <path d="M16 1C16 1 3 16 3 24a13 13 0 0 0 26 0C29 16 16 1 16 1z" style={{ fill: 'rgb(var(--color-brand-500))', stroke: 'rgb(var(--color-white))' }} strokeWidth="2" />
              <text x="16" y="29" textAnchor="middle" fontFamily="Inter,sans-serif" fontSize="11" fontWeight="700" style={{ fill: 'rgb(var(--color-white))' }}>
                H
              </text>
            </svg>
          </AdvancedMarker>
        )}
      </Map>
    </APIProvider>
  );
}
