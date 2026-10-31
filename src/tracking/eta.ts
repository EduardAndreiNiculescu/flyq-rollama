import type { Observation } from './opensky';

export type Point = { lat: number; lon: number };

export type EtaResult =
  | {
      kind: 'estimate';
      target: 'airport-vicinity';
      seconds: number;
      distanceKm: number;
      model: 'direct-progress-v1';
      /** Always false until route factor and thresholds are calibrated on real arrivals. */
      calibrated: false;
      assumptions: string[];
    }
  | { kind: 'unavailable'; reason: string };

const rad = (deg: number) => (deg * Math.PI) / 180;
const wrap180 = (deg: number) => ((((deg + 180) % 360) + 360) % 360) - 180;

export function distanceAndBearing(a: Point, b: Point) {
  const p1 = rad(a.lat);
  const p2 = rad(b.lat);
  const dl = rad(b.lon - a.lon);
  const h = Math.sin((p2 - p1) / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  const distanceKm = 2 * 6371.0088 * Math.asin(Math.sqrt(Math.min(1, h)));
  const y = Math.sin(dl) * Math.cos(p2);
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
  const bearingDeg = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
  return { distanceKm, bearingDeg };
}

/**
 * Rough time until the aircraft is near the airport, from ground speed only.
 * OpenSky `velocity` is already ground speed: wind is NOT added again. Refuses (unavailable)
 * whenever inputs are missing, stale, on the ground, or not heading towards the target.
 * Thresholds are product configuration to be calibrated, not OpenSky rules.
 */
export function roughEta(
  o: Observation,
  airport: Point,
  nowSec: number,
  maxAgeSec: number,
  routeFactor: number,
  opts: { minProgressMps?: number; minDistanceKm?: number } = {},
): EtaResult {
  if (o.lat === null || o.lon === null || o.observedAtSec === null) return { kind: 'unavailable', reason: 'missing_position' };
  if (o.onGround) return { kind: 'unavailable', reason: 'on_ground' };
  if (nowSec - o.observedAtSec > maxAgeSec || o.observedAtSec > nowSec + 30) return { kind: 'unavailable', reason: 'stale_or_future_position' };
  if (o.groundSpeedMps === null || o.trueTrackDeg === null) return { kind: 'unavailable', reason: 'missing_motion' };
  if (!Number.isFinite(routeFactor) || routeFactor < 1) return { kind: 'unavailable', reason: 'bad_route_factor' };
  const { distanceKm, bearingDeg } = distanceAndBearing({ lat: o.lat, lon: o.lon }, airport);
  if (distanceKm < (opts.minDistanceKm ?? 5)) return { kind: 'unavailable', reason: 'final_approach' };
  const progressMps = o.groundSpeedMps * Math.cos(rad(wrap180(bearingDeg - o.trueTrackDeg)));
  if (progressMps < (opts.minProgressMps ?? 30)) return { kind: 'unavailable', reason: 'not_progressing' };
  return {
    kind: 'estimate',
    target: 'airport-vicinity',
    // The position is `age` seconds old: that time has already passed on the way to the airport.
    seconds: Math.max(0, Math.ceil((distanceKm * 1000 * routeFactor) / progressMps) - (nowSec - o.observedAtSec)),
    distanceKm,
    model: 'direct-progress-v1',
    calibrated: false,
    assumptions: ['constant_ground_progress', 'route_factor_must_be_calibrated', 'position_age_deducted'],
  };
}
