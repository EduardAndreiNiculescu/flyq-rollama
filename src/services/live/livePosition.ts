import { haversineKm, interpolateGreatCircle } from '../../lib/geo';
import type { TrackingResult } from '../../tracking/result';
import type { Flight, FlightPosition } from '../../types';
import type { LiveEntry } from './liveFlights';

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Schedule-only position on the great circle (what the user sees until the provider has a fix). Labelled 'estimate'. */
export function positionFromSchedule(entry: LiveEntry, nowMs: number): FlightPosition {
  const { flight, from, to } = entry;
  const dep = Date.parse(flight.departureUtc);
  const arr = Date.parse(flight.arrivalUtc);
  const t = clamp((nowMs - dep) / (arr - dep), 0, 1);
  const here = interpolateGreatCircle(from, to, t);
  const total = haversineKm(from, to);
  const edge = Math.min(t, 1 - t);
  return {
    lat: here.lat,
    lon: here.lon,
    altitudeM: flight.cruiseAltitudeM * clamp(edge * 8, 0, 1),
    groundSpeedKmh: flight.cruiseSpeedKmh * clamp(edge * 8, 0.3, 1),
    distanceRemainingKm: total * (1 - t),
    timeRemainingMin: Math.max(0, (arr - nowMs) / 60_000),
    progress: t,
    source: 'estimate',
    accuracyM: 2400,
  };
}

/** Position from the backend's TrackingResult. Never invents a position: without a fresh fix it falls back to the schedule estimate. */
export function positionFromTracking(tracking: TrackingResult | null, entry: LiveEntry, nowMs: number): FlightPosition {
  if (tracking?.kind === 'unavailable' && tracking.reason === 'flight_completed') {
    const p = positionFromSchedule(entry, Date.parse(entry.flight.arrivalUtc));
    return { ...p, progress: 1, distanceRemainingKm: 0, timeRemainingMin: 0, altitudeM: 0, groundSpeedKmh: 0 };
  }
  if (tracking?.kind !== 'observation') return positionFromSchedule(entry, nowMs);
  const o = tracking.observation;
  if (o.lat === null || o.lon === null || o.onGround) return positionFromSchedule(entry, nowMs);
  const here = { lat: o.lat, lon: o.lon };
  const total = Math.max(1, haversineKm(entry.from, entry.to));
  const remaining = haversineKm(here, entry.to);
  const speedKmh = o.groundSpeedMps !== null ? o.groundSpeedMps * 3.6 : null;
  const scheduleMin = Math.max(0, (Date.parse(entry.flight.arrivalUtc) - nowMs) / 60_000);
  const live = tracking.freshness === 'live';
  return {
    lat: here.lat,
    lon: here.lon,
    altitudeM: o.baroAltitudeM ?? 0,
    groundSpeedKmh: speedKmh ?? 0,
    distanceRemainingKm: remaining,
    // Time left from distance and current speed when we have a plausible cruise speed; else the schedule.
    timeRemainingMin: speedKmh !== null && speedKmh > 150 ? (remaining / speedKmh) * 60 : scheduleMin,
    progress: clamp(1 - remaining / total, 0, 0.999),
    source: live ? 'gps' : 'estimate',
    accuracyM: live ? 50 : 2400,
  };
}

export const flightKey = (f: Flight) => `${f.carrier}${f.flightNumber}`;
