/**
 * Live flight data for the test gateway. SERVER-SIDE ONLY (it sits behind AirLabsClient, which holds the API key).
 * Protects the quota: a short cache per flight number and a hard cap on upstream calls per process.
 */
import type { AirLabsResult } from '../airlabsClient';
import type { FlightRecord } from '../../src/core/types';
import { toFlightRecord, type AirLabsFlight } from '../../src/tracking/airlabs';
import type { TrackingResult } from '../../src/tracking/result';

export type FlightLookup =
  | { ok: true; flight: AirLabsFlight; record: FlightRecord | null }
  | { ok: false; reason: 'not_found' | 'bad_request' | 'auth_error' | 'rate_limited' | 'provider_error' | 'budget_exhausted' };

export interface LiveProvider {
  lookup(flightNumber: string): Promise<FlightLookup>;
  tracking(flightNumber: string): Promise<TrackingResult | null>;
  stats: { upstreamCalls: number; cacheHits: number };
}

const MAX_POSITION_AGE_SEC = 900;

export class AirLabsFlightProvider implements LiveProvider {
  stats = { upstreamCalls: 0, cacheHits: 0 };
  private cache = new Map<string, { at: number; value: FlightLookup }>();
  private airlines = new Map<string, string | null>();

  /**
   * A callsign like "CPA253" (ICAO airline code + number, as flight-radar sites show it) becomes the IATA number "CX253" that the rest of the system uses.
   * The airline code is resolved once through the provider's airline list and remembered. If it cannot be resolved the number is kept as typed
   * and the client looks it up as an ICAO callsign. The provider's answer decides whether the flight exists: nothing is guessed here.
   */
  async normalize(key: string): Promise<string> {
    const m = /^([A-Z]{3})(\d{1,4}[A-Z]?)$/.exec(key);
    if (!m || !this.client.getAirlineIata) return key;
    if (!this.airlines.has(m[1])) {
      if (this.stats.upstreamCalls >= (this.o.maxCalls ?? 25)) return key;
      this.stats.upstreamCalls++;
      this.airlines.set(m[1], await this.client.getAirlineIata(m[1]));
    }
    const iata = this.airlines.get(m[1]);
    // Callsigns pad the number with zeros (QTR037); the commercial number does not (QR37).
    return iata ? iata + m[2].replace(/^0+(?=\d)/, '') : key;
  }

  constructor(
    private client: { getFlightByIata(n: string): Promise<AirLabsResult>; getAirlineIata?(icao: string): Promise<string | null> },
    private o: { ttlMs?: number; maxCalls?: number; nowMs?: () => number } = {},
  ) {}

  private now() {
    return (this.o.nowMs ?? Date.now)();
  }

  async lookup(flightNumber: string): Promise<FlightLookup> {
    const key = await this.normalize(flightNumber.replace(/\s+/g, '').toUpperCase());
    const hit = this.cache.get(key);
    if (hit && this.now() - hit.at < (this.o.ttlMs ?? 60_000)) {
      this.stats.cacheHits++;
      return hit.value;
    }
    if (this.stats.upstreamCalls >= (this.o.maxCalls ?? 25)) return { ok: false, reason: 'budget_exhausted' };
    this.stats.upstreamCalls++;
    const r = await this.client.getFlightByIata(key);
    const value: FlightLookup = r.ok
      ? { ok: true, flight: r.flight, record: toFlightRecord(r.flight, { nowSec: Math.floor(this.now() / 1000) }) }
      : { ok: false, reason: r.reason };
    // Errors are cached too (briefly), so a failing upstream is not hammered by repeated questions.
    this.cache.set(key, { at: this.now(), value });
    return value;
  }

  /** Live position as a TrackingResult. Never infers delay/cancellation; stale or missing data is "unavailable". */
  async tracking(flightNumber: string): Promise<TrackingResult | null> {
    const nowSec = Math.floor(this.now() / 1000);
    const l = await this.lookup(flightNumber);
    if (!l.ok) {
      const reason = l.reason === 'not_found' ? 'unresolved_flight' : l.reason === 'rate_limited' || l.reason === 'budget_exhausted' ? 'rate_limited' : 'provider_error';
      return { kind: 'unavailable', schemaVersion: 1, reason, checkedAtSec: nowSec };
    }
    const f = l.flight;
    // Live check: a flight marked "landed" came back with the aircraft's position at the DEPARTURE airport. Never present that as a live position.
    if (f.status === 'landed') return { kind: 'unavailable', schemaVersion: 1, reason: 'flight_completed', checkedAtSec: nowSec };
    if (f.lat === null || f.lng === null || f.updatedSec === null) return { kind: 'unavailable', schemaVersion: 1, reason: 'no_coverage', checkedAtSec: nowSec };
    if (nowSec - f.updatedSec > MAX_POSITION_AGE_SEC) return { kind: 'unavailable', schemaVersion: 1, reason: 'stale_position', checkedAtSec: nowSec };
    return {
      kind: 'observation',
      schemaVersion: 1,
      flightKey: (f.flightIata ?? flightNumber).toUpperCase(),
      identity: { status: 'confirmed', evidence: ['airlabs flight_iata match'] },
      providerTimeSec: f.updatedSec,
      receivedAtSec: nowSec,
      freshness: 'live',
      observation: {
        icao24: f.hex ?? 'unknown',
        callsign: f.flightIcao,
        observedAtSec: f.updatedSec,
        lastContactSec: f.updatedSec,
        lat: f.lat,
        lon: f.lng,
        // The AirLabs docs label `speed` as "km" with no time unit. Checked on a live response on 2026-10-29: 29 flights at 8-13 km
        // altitude had speed 870-910 (median 894), i.e. km/h (m/s would be ~250). `alt` is metres. Re-check if the plan or version changes.
        groundSpeedMps: f.speedRaw === null ? null : f.speedRaw / 3.6, // km/h, see the note above
        trueTrackDeg: f.dirDeg,
        baroAltitudeM: f.altM,
        verticalRateMps: null,
        // AirLabs omits `alt` on the ground, so a missing altitude must NOT read as "airborne" (live check: taxiing aircraft, alt absent, speed 8).
        onGround: f.altM !== null ? f.altM < 30 : f.status !== 'en-route' || (f.speedRaw ?? 0) < 60,
        positionSource: null,
        provider: 'airlabs',
      },
    };
  }
}
