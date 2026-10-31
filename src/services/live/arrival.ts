import { airportPoint } from '../../core/airports';
import flights from '../../data/flights.json';
import type { FlightRecord } from '../../core/types';
import { distanceAndBearing, roughEta } from '../../tracking/eta';
import { fetchFlight, fetchServerEta } from './gatewayClient';

/** What the card and the live screen show once the aircraft is in the air. `estimate` is the app's own rough model (calibrated: false), not an airline statement. */
export type ArrivalEstimate = {
  /** 'server' = the FlyQ server's ETA (provider estimate, or position + wind model); 'local' = the app's own rough model from the live position */
  source: 'server' | 'local';
  /** The server's kind: actual | provider_estimate | position_estimate (local estimates have none) */
  kind?: string;
  /** Licence text to show when the wind data is used (Open-Meteo, CC BY 4.0) */
  attribution?: string | null;
  arrivalEpoch: number; // unix seconds
  arrivalTime: string; // "HH:MM", clock at the destination
  progress: number; // 0..1 of the route already flown (great-circle)
  remainingKm: number;
};

/** The UTC offset (minutes) written at the end of an ISO string such as "2026-10-31T14:10:00+00:00", or null. */
function offsetMin(iso: string): number | null {
  if (/Z$/.test(iso)) return 0;
  const m = /([+-])(\d{2}):?(\d{2})$/.exec(iso);
  return m ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) : null;
}

/** The verified registry first (core/airports.ts); the demo flights' own airports (data/flights.json) as a fallback, so the demo route has an estimate too. */
function pointOf(iata: string) {
  const known = airportPoint(iata);
  if (known) return known;
  const a = (flights.airports as { code: string; lat: number; lon: number }[]).find((x) => x.code === iata.toUpperCase());
  return a ? { lat: a.lat, lon: a.lon } : null;
}

const pad = (n: number) => String(n).padStart(2, '0');
export function clockAt(epochSec: number, offset: number): string {
  const d = new Date(epochSec * 1000 + offset * 60_000);
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

const CACHE_MS = 20_000;
const cache = new Map<string, { at: number; value: ArrivalEstimate | null }>();

/** The server's ETA, turned into what the card and screens show. Null when the server has none (not a kind we trust, no key, offline). */
async function serverArrival(record: FlightRecord, nowSec: number): Promise<ArrivalEstimate | null> {
  const date = record.scheduledDeparture.slice(0, 10);
  const j = await fetchServerEta(record.flightNumber, date);
  const eta = j?.eta;
  if (!eta || typeof eta.etaUtc !== 'string' || !['actual', 'provider_estimate', 'position_estimate'].includes(eta.kind ?? '')) return null;
  const epoch = Math.floor(Date.parse(eta.etaUtc) / 1000);
  if (!Number.isFinite(epoch)) return null;
  const target = pointOf(record.arrivalAirport);
  const origin = pointOf(record.departureAirport);
  const distanceM = j?.positionModel?.distanceM;
  const total = origin && target ? distanceAndBearing(origin, target).distanceKm : null;
  const remainingKm = typeof distanceM === 'number' ? Math.round(distanceM / 1000) : 0;
  const progress = total && typeof distanceM === 'number' ? Math.min(1, Math.max(0, 1 - distanceM / 1000 / total)) : eta.kind === 'actual' ? 1 : 0.5;
  return { source: 'server', kind: eta.kind, attribution: j?.positionModel?.windSource ?? null, arrivalEpoch: epoch, arrivalTime: clockAt(epoch, offsetMin(record.scheduledArrival) ?? 0), progress, remainingKm };
}

/**
 * Landing estimate for the card and the screens. First the FlyQ server (its ETA already combines the data providers and wind); if it has nothing, the
 * app's own rough model from the live position that the server gives. Null when neither has anything (not airborne yet, offline, stale): the screens then
 * keep the scheduled arrival instead of inventing one. Results are kept for 20 s so the card timer, the sync and the live screen share one request.
 */
export async function liveArrival(record: FlightRecord, nowSec = Math.floor(Date.now() / 1000)): Promise<ArrivalEstimate | null> {
  const key = record.flightNumber;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;
  let value: ArrivalEstimate | null = null;
  try {
    value = await serverArrival(record, nowSec);
  } catch {
    value = null; // the server answered with an error: fall back to the position below
  }
  if (!value) value = await localArrival(record, nowSec);
  cache.set(key, { at: Date.now(), value });
  return value;
}

/** The app's own estimate from the server's live position (roughEta). */
async function localArrival(record: FlightRecord, nowSec: number): Promise<ArrivalEstimate | null> {
  try {
    const { tracking } = await fetchFlight(record.flightNumber);
    if (!tracking || tracking.kind !== 'observation') return null;
    const target = pointOf(record.arrivalAirport);
    const origin = pointOf(record.departureAirport);
    if (!target) return null;
    const eta = roughEta(tracking.observation, target, nowSec, 900, 1.15);
    if (eta.kind !== 'estimate') return null;
    const total = origin ? distanceAndBearing(origin, target).distanceKm : null;
    const progress = total && total > 0 ? Math.min(1, Math.max(0, 1 - eta.distanceKm / total)) : 0.5;
    const arrivalEpoch = nowSec + eta.seconds;
    const offset = offsetMin(record.scheduledArrival) ?? 0;
    return { source: 'local', arrivalEpoch, arrivalTime: clockAt(arrivalEpoch, offset), progress, remainingKm: Math.round(eta.distanceKm) };
  } catch {
    return null;
  }
}

/** For tests: forget the cached estimates. */
export const clearArrivalCache = () => cache.clear();
