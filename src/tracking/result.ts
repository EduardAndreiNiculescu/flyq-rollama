import type { Observation } from './opensky';

/** Backend -> app contract. The app only ever talks to the FlightFlow backend, never to OpenSky. */
export type TrackingResult =
  | {
      kind: 'observation';
      schemaVersion: 1;
      flightKey: string;
      identity: { status: 'confirmed' | 'probable'; evidence: string[] };
      observation: Observation;
      providerTimeSec: number;
      receivedAtSec: number;
      freshness: 'live' | 'delayed';
    }
  | {
      kind: 'unavailable';
      schemaVersion: 1;
      reason: 'unresolved_flight' | 'ambiguous_match' | 'no_coverage' | 'stale_position' | 'rate_limited' | 'provider_error' | 'flight_completed';
      checkedAtSec: number;
      retryAfterSec?: number;
    };

const REASONS = ['unresolved_flight', 'ambiguous_match', 'no_coverage', 'stale_position', 'rate_limited', 'provider_error', 'flight_completed'];
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isNumOrNull = (v: unknown) => v === null || isNum(v);

/** Runtime validation of untrusted JSON (a TypeScript cast would validate nothing). */
export function parseTrackingResult(payload: unknown): TrackingResult {
  if (!payload || typeof payload !== 'object') throw new Error('bad_payload');
  const p = payload as Record<string, any>;
  if (p.schemaVersion !== 1) throw new Error('unsupported_schema');
  if (p.kind === 'unavailable') {
    if (!REASONS.includes(p.reason) || !isNum(p.checkedAtSec)) throw new Error('bad_unavailable');
    if (p.retryAfterSec !== undefined && !isNum(p.retryAfterSec)) throw new Error('bad_retry_after');
    return p as TrackingResult;
  }
  if (p.kind !== 'observation') throw new Error('bad_kind');
  if (typeof p.flightKey !== 'string' || !p.flightKey) throw new Error('bad_flight_key');
  if (!p.identity || !['confirmed', 'probable'].includes(p.identity.status) || !Array.isArray(p.identity.evidence)) throw new Error('bad_identity');
  if (!isNum(p.providerTimeSec) || !isNum(p.receivedAtSec) || !['live', 'delayed'].includes(p.freshness)) throw new Error('bad_times');
  const o = p.observation;
  if (!o || typeof o !== 'object' || !['opensky', 'airlabs'].includes(o.provider) || typeof o.icao24 !== 'string' || typeof o.onGround !== 'boolean') throw new Error('bad_observation');
  for (const k of ['observedAtSec', 'lat', 'lon', 'groundSpeedMps', 'trueTrackDeg', 'baroAltitudeM', 'verticalRateMps', 'positionSource']) {
    if (!isNumOrNull(o[k])) throw new Error(`bad_observation_${k}`);
  }
  if (!isNum(o.lastContactSec)) throw new Error('bad_observation_lastContactSec');
  if ((o.lat !== null && Math.abs(o.lat) > 90) || (o.lon !== null && Math.abs(o.lon) > 180)) throw new Error('bad_coordinates');
  return p as TrackingResult;
}
