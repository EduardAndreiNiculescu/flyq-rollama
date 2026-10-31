import { describe, expect, it } from 'vitest';
import pois from '../../src/data/pois.json';
import { buildLiveEntry, offsetMinAt } from '../../src/services/live/liveFlights';
import { positionFromSchedule, positionFromTracking } from '../../src/services/live/livePosition';
import { matchPoi } from '../../src/services/live/poiMatch';
import type { FlightRecord } from '../../src/core/types';
import type { TrackingResult } from '../../src/tracking/result';
import type { Poi } from '../../src/types';

const record: FlightRecord = {
  flightNumber: 'W63541', departureAirport: 'CRA', arrivalAirport: 'LTN',
  scheduledDeparture: '2026-10-31T10:40:00+02:00', scheduledArrival: '2026-10-31T11:50:00+00:00',
  gate: '3', gateStatus: 'confirmed', dataSource: 'airlabs', lastUpdated: null,
};
const built = buildLiveEntry(record);
if (!built.ok) throw new Error(built.error);
const entry = built.entry;
const at = (iso: string) => Date.parse(iso);

describe('buildLiveEntry', () => {
  it('maps the gateway record to the UI flight with DST-correct offsets', () => {
    expect(entry.flight).toMatchObject({ carrier: 'W6', flightNumber: '3541', from: 'CRA', to: 'LTN', departureUtc: '2026-10-31T08:40:00.000Z', arrivalUtc: '2026-10-31T11:50:00.000Z', gate: '3' });
    expect(entry.from.utcOffsetMin).toBe(120);
    expect(entry.to.utcOffsetMin).toBe(0);
  });
  it('an unconfirmed gate is not shown as a gate', () => {
    const r = buildLiveEntry({ ...record, gate: 'B7', gateStatus: 'unconfirmed' });
    expect(r.ok && r.entry.flight.gate).toBe('—');
  });
  it('refuses unknown airports and bad numbers instead of guessing', () => {
    expect(buildLiveEntry({ ...record, arrivalAirport: 'XXX' })).toMatchObject({ ok: false });
    expect(buildLiveEntry({ ...record, flightNumber: 'NOPE' })).toMatchObject({ ok: false });
  });
  it('offsets follow DST: London is +60 in summer', () => {
    expect(offsetMinAt('Europe/London', at('2026-07-01T12:00:00Z'))).toBe(60);
  });
});

describe('positions', () => {
  it('schedule position is an estimate and moves from origin to destination', () => {
    const start = positionFromSchedule(entry, at('2026-10-31T08:40:00Z'));
    const end = positionFromSchedule(entry, at('2026-10-31T11:50:00Z'));
    expect(start.source).toBe('estimate');
    expect(start.progress).toBe(0);
    expect(end.progress).toBe(1);
  });
  it('a live observation gives gps source, real distance, and speed-based time left', () => {
    const tracking: TrackingResult = {
      kind: 'observation', schemaVersion: 1, flightKey: 'W63541', identity: { status: 'confirmed', evidence: [] },
      observation: { icao24: 'abc123', callsign: null, observedAtSec: 1, lastContactSec: 1, lat: 48.0, lon: 14.0, groundSpeedMps: 230, trueTrackDeg: 300, baroAltitudeM: 10500, verticalRateMps: 0, onGround: false, positionSource: 0, provider: 'airlabs' },
      providerTimeSec: 1, receivedAtSec: 1, freshness: 'live',
    };
    const p = positionFromTracking(tracking, entry, at('2026-10-31T10:00:00Z'));
    expect(p.source).toBe('gps');
    expect(p.altitudeM).toBe(10500);
    expect(p.groundSpeedKmh).toBeCloseTo(828, 0);
    expect(p.progress).toBeGreaterThan(0.3);
    expect(p.timeRemainingMin).toBeCloseTo((p.distanceRemainingKm / 828) * 60, 0);
  });
  it('no fix or provider error: falls back to the schedule estimate, never invents a position', () => {
    const now = at('2026-10-31T10:00:00Z');
    expect(positionFromTracking(null, entry, now).source).toBe('estimate');
    expect(positionFromTracking({ kind: 'unavailable', schemaVersion: 1, reason: 'provider_error', checkedAtSec: 1 }, entry, now).source).toBe('estimate');
  });
  it('a completed flight is progress 1', () => {
    expect(positionFromTracking({ kind: 'unavailable', schemaVersion: 1, reason: 'flight_completed', checkedAtSec: 1 }, entry, at('2026-10-31T13:00:00Z')).progress).toBe(1);
  });
});

describe('matchPoi', () => {
  const list = pois as Poi[];
  it('finds places by the words passengers use, in RO and EN', () => {
    expect(matchPoi('toaleta', list)?.kind).toBe('toilet');
    expect(matchPoi('Where is the restroom', list)?.kind).toBe('toilet');
    expect(matchPoi('poarta 3', list)?.nodeId).toBe('f1_gate3');
    expect(matchPoi('gate 2', list)?.nodeId).toBe('f1_gate2');
  });
  it('returns null instead of guessing', () => {
    expect(matchPoi('heliport', list)).toBeNull();
    expect(matchPoi('poarta 99', list)).toBeNull();
  });
});
