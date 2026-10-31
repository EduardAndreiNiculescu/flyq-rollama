import { airportPoint } from '../../core/airports';
import flights from '../../data/flights.json';
import type { FlightRecord } from '../../core/types';
import { distanceAndBearing, roughEta } from '../../tracking/eta';
import { fetchFlight } from './gatewayClient';

/** What the card and the live screen show once the aircraft is in the air. `estimate` is the app's own rough model (calibrated: false), not an airline statement. */
export type ArrivalEstimate = {
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

/**
 * Landing estimate from the FlyQ server's live position of the aircraft (the app never talks to the providers itself): ground speed and
 * distance to the destination, with the app's rough ETA model. Null when there is no live position (not airborne yet, server without
 * tracking for this flight, offline, stale): the card then keeps the scheduled arrival instead of inventing one.
 */
export async function liveArrival(record: FlightRecord, nowSec = Math.floor(Date.now() / 1000)): Promise<ArrivalEstimate | null> {
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
    return { arrivalEpoch, arrivalTime: clockAt(arrivalEpoch, offset), progress, remainingKm: Math.round(eta.distanceKm) };
  } catch {
    return null;
  }
}
