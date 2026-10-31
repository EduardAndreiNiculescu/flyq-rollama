/**
 * AirLabs /flight parsing and normalization. Pure functions: no network, no key.
 *
 * ASSUMPTIONS (the public docs page lists the fields but not the envelope or a sample payload):
 *  - success payload is {"request":…, "response":{…}} (we also accept the object at top level);
 *  - errors are {"error":{"message","code"}};
 *  - dep_time/arr_time are airport-LOCAL "YYYY-MM-DD HH:mm", *_utc are UTC in the same format,
 *    *_ts are UNIX seconds. We derive each airport's UTC offset from (local - utc).
 * Verify these against a real response before relying on them (see docs/BACKEND_CONTEXT.md §10).
 */
import { airportTimeZone, localIso } from '../core/airports';
import type { FlightRecord } from '../core/types';

export type AirLabsStatus = 'scheduled' | 'en-route' | 'landed';

export type AirLabsFlight = {
  hex: string | null;
  flightIata: string | null;
  flightIcao: string | null;
  regNumber: string | null;
  depIata: string | null;
  arrIata: string | null;
  depTerminal: string | null;
  depGate: string | null;
  arrGate: string | null;
  depTime: string | null; // local
  depTimeUtc: string | null;
  depEstimated: string | null;
  depEstimatedUtc: string | null;
  arrTime: string | null;
  arrTimeUtc: string | null;
  arrEstimated: string | null;
  arrEstimatedUtc: string | null;
  status: AirLabsStatus | null;
  depDelayedMin: number | null;
  arrDelayedMin: number | null;
  durationMin: number | null;
  lat: number | null;
  lng: number | null;
  altM: number | null;
  /** km/h (the docs only say "km"; checked on 29 cruising flights, median 894 at ~11,770 m altitude). Converted by the caller. */
  speedRaw: number | null;
  /** heading in degrees (field `dir`) */
  dirDeg: number | null;
  updatedSec: number | null;
};

export type AirLabsError = { code: string; message: string };

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const code = (v: unknown, re: RegExp): string | null => {
  const s = str(v);
  return s && re.test(s) ? s : null;
};

/** Extract an API error from a payload, if there is one. */
export function readAirLabsError(json: unknown): AirLabsError | null {
  if (!json || typeof json !== 'object') return null;
  const e = (json as { error?: unknown }).error;
  if (!e || typeof e !== 'object') return null;
  const { code, message } = e as { code?: unknown; message?: unknown };
  return { code: typeof code === 'string' ? code : 'unknown', message: typeof message === 'string' ? message.slice(0, 200) : '' };
}

const LATLNG_OK = (lat: number | null, lng: number | null) => (lat === null || Math.abs(lat) <= 90) && (lng === null || Math.abs(lng) <= 180);

/** Validate and normalize one flight object. Throws on a structurally unusable payload. */
export function parseAirLabsFlight(json: unknown): AirLabsFlight {
  if (!json || typeof json !== 'object') throw new Error('airlabs_bad_payload');
  const root = json as Record<string, unknown>;
  const o = (root.response && typeof root.response === 'object' && !Array.isArray(root.response) ? root.response : root) as Record<string, unknown>;
  if (!o || typeof o !== 'object') throw new Error('airlabs_bad_payload');
  const status = str(o.status);
  const lat = num(o.lat);
  const lng = num(o.lng);
  if (!LATLNG_OK(lat, lng)) throw new Error('airlabs_bad_coordinates');
  const flight: AirLabsFlight = {
    hex: code(o.hex, /^[0-9a-f]{6}$/i)?.toLowerCase() ?? null,
    flightIata: str(o.flight_iata),
    flightIcao: str(o.flight_icao),
    regNumber: str(o.reg_number),
    depIata: code(o.dep_iata, /^[A-Za-z]{3}$/)?.toUpperCase() ?? null,
    arrIata: code(o.arr_iata, /^[A-Za-z]{3}$/)?.toUpperCase() ?? null,
    depTerminal: str(o.dep_terminal),
    depGate: str(o.dep_gate),
    arrGate: str(o.arr_gate),
    depTime: code(o.dep_time, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/),
    depTimeUtc: code(o.dep_time_utc, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/),
    depEstimated: code(o.dep_estimated, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/),
    depEstimatedUtc: code(o.dep_estimated_utc, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/),
    arrTime: code(o.arr_time, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/),
    arrTimeUtc: code(o.arr_time_utc, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/),
    arrEstimated: code(o.arr_estimated, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/),
    arrEstimatedUtc: code(o.arr_estimated_utc, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/),
    status: status === 'scheduled' || status === 'en-route' || status === 'landed' ? status : null,
    depDelayedMin: num(o.dep_delayed),
    arrDelayedMin: num(o.arr_delayed),
    durationMin: num(o.duration),
    lat,
    lng,
    altM: num(o.alt),
    speedRaw: num(o.speed),
    dirDeg: num(o.dir),
    updatedSec: num(o.updated),
  };
  if (!flight.flightIata && !flight.flightIcao && !flight.hex) throw new Error('airlabs_no_identity');
  return flight;
}

const toMs = (s: string) => Date.parse(`${s.slice(0, 10)}T${s.slice(11, 16)}:00Z`);

/** Offset like "+02:00" such that local = utc + offset. Null when either side is missing or implausible. */
export function offsetFrom(local: string | null, utc: string | null): string | null {
  if (!local || !utc) return null;
  const diff = Math.round((toMs(local) - toMs(utc)) / 60000);
  if (!Number.isFinite(diff) || diff % 15 !== 0 || Math.abs(diff) > 14 * 60) return null;
  const sign = diff < 0 ? '-' : '+';
  const a = Math.abs(diff);
  return `${sign}${String(Math.floor(a / 60)).padStart(2, '0')}:${String(a % 60).padStart(2, '0')}`;
}

/** "2026-10-31 12:45" + "+02:00" -> "2026-10-31T12:45:00+02:00" */
const iso = (local: string, off: string) => `${local.slice(0, 10)}T${local.slice(11, 16)}:00${off}`;
const isoUtc = (utc: string) => `${utc.slice(0, 10)}T${utc.slice(11, 16)}:00Z`;

export type NormalizeOptions = {
  nowSec: number;
  /** A gate counts as confirmed only if AirLabs `updated` is at most this old. */
  maxGateAgeSec?: number;
};

/**
 * Map an AirLabs flight to the app's FlightRecord. Returns null when the schedule cannot be
 * established (we never invent times). Provider estimates and reported delays are carried in separate optional fields; the schedule is never overwritten.
 */
export function toFlightRecord(f: AirLabsFlight, opts: NormalizeOptions): FlightRecord | null {
  const flightNumber = f.flightIata ?? f.flightIcao;
  if (!flightNumber || !f.depIata || !f.arrIata) return null;
  // The provider's UTC fields are consistent; its "local" fields are not always (live check: an Amsterdam arrival came back
  // in the departure airport's offset). So: UTC + the airport's own IANA zone when we know it; otherwise UTC, labelled as such.
  // Only the departure side may fall back to the provider's local/UTC difference.
  const stamp = (utc: string | null, local: string | null, iata: string | null, trustLocal: boolean): string | null => {
    if (!utc) return null;
    const tz = iata ? airportTimeZone(iata) : null;
    if (tz) return localIso(toMs(utc), tz);
    const off = trustLocal ? offsetFrom(local, utc) : null;
    return local && off ? iso(local, off) : isoUtc(utc);
  };
  const dep = stamp(f.depTimeUtc, f.depTime, f.depIata, true);
  const arr = stamp(f.arrTimeUtc, f.arrTime, f.arrIata, false);
  if (!dep || !arr) return null;
  const estDep = stamp(f.depEstimatedUtc, f.depEstimated, f.depIata, true);
  const estArr = stamp(f.arrEstimatedUtc, f.arrEstimated, f.arrIata, false);
  const fresh = f.updatedSec !== null && opts.nowSec - f.updatedSec <= (opts.maxGateAgeSec ?? 1800) && opts.nowSec >= f.updatedSec - 60;
  const confirmed = !!f.depGate && fresh;
  return {
    flightNumber: flightNumber.replace(/\s+/g, '').toUpperCase(),
    departureAirport: f.depIata,
    arrivalAirport: f.arrIata,
    scheduledDeparture: dep,
    scheduledArrival: arr,
    gate: confirmed ? f.depGate : null,
    gateStatus: confirmed ? 'confirmed' : 'unconfirmed',
    dataSource: 'airlabs',
    lastUpdated: f.updatedSec !== null ? new Date(f.updatedSec * 1000).toISOString() : null,
    estimatedDeparture: estDep,
    estimatedArrival: estArr,
    departureDelayMin: f.depDelayedMin,
    arrivalDelayMin: f.arrDelayedMin,
    providerStatus: f.status,
  };
}

/** Lines the model may see about status/delay; always attributed and never presented as official. */
export function airlabsStatusFacts(f: AirLabsFlight, nowSec: number): string {
  const age = f.updatedSec === null ? null : Math.max(0, Math.round((nowSec - f.updatedSec) / 60));
  const lines = ['status source: AirLabs (third-party data, not an official airport or airline statement)'];
  lines.push(`status: ${f.status ?? 'UNKNOWN'}`);
  lines.push(`departure delay: ${f.depDelayedMin === null ? 'UNKNOWN' : `${f.depDelayedMin} min`}`);
  lines.push(`arrival delay: ${f.arrDelayedMin === null ? 'UNKNOWN' : `${f.arrDelayedMin} min`}`);
  lines.push(`data age: ${age === null ? 'unknown' : `${age} min`}`);
  return lines.join('\n');
}
