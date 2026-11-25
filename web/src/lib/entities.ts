import type { Stammdaten } from './api';
import { formatDateTime } from './format';
import type { EntityKind } from './types';

/** Beschreibung der Stammdaten-Bereiche (Index-Kacheln, Listen, Edit-Ansicht) */

export interface Column {
  key: string;
  label: string;
  className?: string;
}

export interface Row {
  id: string;
  cells: Record<string, string>;
}

export interface FieldDef {
  key: string; // entspricht Issue.field
  label: string;
  value: (record: any) => string;
  multiline?: boolean;
}

export interface EntityDef {
  slug: string;
  kind: EntityKind;
  title: string;
  description: string;
  icon: string;
  columns: Column[];
  rows: (d: Stammdaten) => Row[];
  find: (d: Stammdaten, id: string) => unknown;
  fields: FieldDef[];
}

const dash = (v: unknown) => (v === null || v === undefined || v === '' ? '—' : String(v));

export const ENTITIES: EntityDef[] = [
  {
    slug: 'anfragen',
    kind: 'request',
    title: 'Offene Anfragen',
    description: 'Angenommene Angebote, die noch eine Besichtigung brauchen',
    icon: 'inbox',
    columns: [
      { key: 'id', label: 'ID', className: 'w-28' },
      { key: 'customer', label: 'Kunde' },
      { key: 'address', label: 'Adresse' },
      { key: 'type', label: 'Typ', className: 'w-20' },
      { key: 'from', label: 'Ab', className: 'w-16' },
      { key: 'region', label: 'Zuständig', className: 'w-32' },
      { key: 'createdAt', label: 'Eingang', className: 'w-40' },
    ],
    rows: (d) =>
      [...d.requests]
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        .map((r) => ({
          id: r.id,
          cells: {
            id: r.id,
            customer: r.customer,
            address: r.address,
            type: dash(r.visitationType),
            from: dash(r.customerAvailableFrom),
            region:
              (d.responsibility?.[r.id] ?? [])
                .map((id) => d.technicians.find((t) => t.id === id)?.name.replace(/^Techniker\s+/i, '') ?? id)
                .join(', ') || '—',
            createdAt: formatDateTime(r.createdAt),
          },
        })),
    find: (d, id) => d.requests.find((r) => r.id === id),
    fields: [
      { key: 'customer', label: 'Kunde', value: (r) => r.customer },
      { key: 'address', label: 'Adresse', value: (r) => r.address },
      { key: 'lat', label: 'Breitengrad (lat)', value: (r) => dash(r.lat) },
      { key: 'lng', label: 'Längengrad (lng)', value: (r) => dash(r.lng) },
      { key: 'visitationType', label: 'Besichtigungstyp', value: (r) => dash(r.visitationType) },
      { key: 'durationMinutes', label: 'Dauer vor Ort (min)', value: (r) => String(r.durationMinutes) },
      { key: 'customerAvailableFrom', label: 'Kunde verfügbar ab', value: (r) => dash(r.customerAvailableFrom) },
      { key: 'createdAt', label: 'Eingang der Anfrage', value: (r) => formatDateTime(r.createdAt) },
      { key: 'notes', label: 'Notiz (Vertrieb)', value: (r) => dash(r.notes), multiline: true },
    ],
  },
  {
    slug: 'techniker',
    kind: 'technician',
    title: 'Außendienst',
    description: 'Techniker:innen mit Wohnort und Einsatzgebiet',
    icon: 'users',
    columns: [
      { key: 'id', label: 'ID', className: 'w-28' },
      { key: 'name', label: 'Name' },
      { key: 'home', label: 'Wohnort' },
      { key: 'region', label: 'Gebiet', className: 'w-32' },
      { key: 'days', label: 'Verfügbare Tage', className: 'w-36' },
    ],
    rows: (d) =>
      d.technicians.map((t) => ({
        id: t.id,
        cells: {
          id: t.id,
          name: t.name,
          home: t.home.label,
          region: t.region.length >= 3 ? `${t.region.length} Eckpunkte` : 'keines',
          days: String(d.availability.filter((a) => a.technicianId === t.id && !a.blocked).length),
        },
      })),
    find: (d, id) => d.technicians.find((t) => t.id === id),
    fields: [
      { key: 'name', label: 'Name', value: (t) => t.name },
      { key: 'home', label: 'Wohnort', value: (t) => `${t.home.label} (${t.home.lat}, ${t.home.lng})` },
      { key: 'region', label: 'Einsatzgebiet', value: (t) => (t.region.length ? t.region.map((p: any) => `${p.lat}, ${p.lng}`).join('\n') : ''), multiline: true },
      { key: 'availability', label: 'Verfügbarkeit im Zeitraum', value: () => '' },
    ],
  },
  {
    slug: 'termine',
    kind: 'appointment',
    title: 'Fixe Termine',
    description: 'Bestehende Besichtigungen & Inbetriebnahmen – nicht verschiebbar',
    icon: 'calendar',
    columns: [
      { key: 'id', label: 'ID', className: 'w-28' },
      { key: 'tech', label: 'Techniker', className: 'w-28' },
      { key: 'type', label: 'Art', className: 'w-36' },
      { key: 'customer', label: 'Kunde' },
      { key: 'start', label: 'Beginn', className: 'w-40' },
    ],
    rows: (d) =>
      [...d.appointments]
        .sort((a, b) => a.start.localeCompare(b.start))
        .map((a) => ({
          id: a.id,
          cells: { id: a.id, tech: a.technicianId, type: a.type, customer: `${a.customer} · ${a.address}`, start: formatDateTime(a.start) },
        })),
    find: (d, id) => d.appointments.find((a) => a.id === id),
    fields: [
      { key: 'technicianId', label: 'Techniker', value: (a) => a.technicianId },
      { key: 'type', label: 'Art', value: (a) => a.type },
      { key: 'start', label: 'Beginn', value: (a) => formatDateTime(a.start) },
      { key: 'end', label: 'Ende', value: (a) => formatDateTime(a.end) },
      { key: 'customer', label: 'Kunde', value: (a) => a.customer },
      { key: 'address', label: 'Adresse', value: (a) => a.address },
    ],
  },
  {
    slug: 'verfuegbarkeiten',
    kind: 'availability',
    title: 'Verfügbarkeiten',
    description: 'Arbeitsfenster pro Person und Tag',
    icon: 'clock',
    columns: [
      { key: 'tech', label: 'Techniker', className: 'w-28' },
      { key: 'date', label: 'Datum', className: 'w-32' },
      { key: 'window', label: 'Fenster' },
      { key: 'blocked', label: 'Gesperrt', className: 'w-28' },
    ],
    rows: (d) =>
      [...d.availability]
        .sort((a, b) => a.date.localeCompare(b.date) || a.technicianId.localeCompare(b.technicianId))
        .map((a) => ({
          id: `${a.technicianId}@${a.date}`,
          cells: { tech: a.technicianId, date: a.date, window: `${a.start} – ${a.end}`, blocked: a.blocked ? 'ja' : 'nein' },
        })),
    find: (d, id) => d.availability.find((a) => `${a.technicianId}@${a.date}` === id),
    fields: [
      { key: 'technicianId', label: 'Techniker', value: (a) => a.technicianId },
      { key: 'date', label: 'Datum', value: (a) => a.date },
      { key: 'start', label: 'Fenster', value: (a) => `${a.start} – ${a.end}` },
      { key: 'blocked', label: 'Gesperrt', value: (a) => (a.blocked ? 'ja' : 'nein') },
    ],
  },
];

export const entityBySlug = (slug?: string) => ENTITIES.find((e) => e.slug === slug);
export const entityByKind = (kind: EntityKind) => ENTITIES.find((e) => e.kind === kind)!;
