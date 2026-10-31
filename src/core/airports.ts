import registry from '../data/airports.json';
import type { Point } from '../tracking/eta';

type AirportRow = { iata: string; latDeg?: number; lonDeg?: number; ianaTimeZone?: string };

/** Verified aerodrome reference point for an IATA code, or null when we have no official value. */
export function airportPoint(iata: string): Point | null {
  const a = (registry.airports as AirportRow[]).find((x) => x.iata === iata.toUpperCase());
  return a && typeof a.latDeg === 'number' && typeof a.lonDeg === 'number' ? { lat: a.latDeg, lon: a.lonDeg } : null;
}

/** IANA time zone of an airport we know, or null. */
export function airportTimeZone(iata: string): string | null {
  const a = (registry.airports as AirportRow[]).find((x) => x.iata === iata.toUpperCase());
  return a?.ianaTimeZone ?? null;
}

/** "2026-10-29T03:40:00+01:00" for an instant, expressed in the given IANA zone (DST-correct, via Intl). */
export function localIso(utcMs: number, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(utcMs));
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  const asIfUtc = Date.UTC(Number(g('year')), Number(g('month')) - 1, Number(g('day')), Number(g('hour')), Number(g('minute')), Number(g('second')));
  const offMin = Math.round((asIfUtc - Math.floor(utcMs / 1000) * 1000) / 60000);
  const a = Math.abs(offMin);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${g('year')}-${g('month')}-${g('day')}T${g('hour')}:${g('minute')}:${g('second')}${offMin < 0 ? '-' : '+'}${pad(Math.floor(a / 60))}:${pad(a % 60)}`;
}
