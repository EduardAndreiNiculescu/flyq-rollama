import { describe, expect, it } from 'vitest';
import { buildLiveEntry, lookupAirport } from '../src/services/live/liveFlights';
import type { FlightRecord } from '../src/core/types';

const rec = (over: Partial<FlightRecord>): FlightRecord => ({
  flightNumber: 'JL115',
  departureAirport: 'HND',
  arrivalAirport: 'LHR',
  scheduledDeparture: '2026-11-01T11:00:00+09:00',
  scheduledArrival: '2026-11-01T16:00:00+00:00',
  gate: '112',
  gateStatus: 'confirmed',
  dataSource: 'airlabs',
  lastUpdated: null,
  ...over,
});

describe('airports from anywhere in the world', () => {
  it('builds a flight between airports that are not in the hand-written table (Tokyo Haneda)', () => {
    const r = buildLiveEntry(rec({}));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.entry.from.code).toBe('HND');
      expect(r.entry.from.utcOffsetMin).toBe(540);
      expect(r.entry.flight.gate).toBe('112'); // a confirmed gate from the server is shown
    }
  });
  it('keeps the hand-written entries (Romanian names) ahead of the world table', () => {
    expect(lookupAirport('OTP')?.city).toBe('București');
    expect(lookupAirport('JFK')?.tz).toBe('America/New_York');
  });
  it('still refuses a code that exists nowhere, with the code in the message', () => {
    const r = buildLiveEntry(rec({ departureAirport: 'ZZZ' }));
    expect(r).toMatchObject({ ok: false });
    if (!r.ok) expect(r.error).toContain('ZZZ');
  });
});
