import { describe, expect, it, vi } from 'vitest';

const NOW = 1_800_000_000;
vi.mock('../src/services/live/gatewayClient', () => ({
  fetchFlight: vi.fn(async () => ({
    record: null,
    // about halfway between Craiova and Luton, flying north-west at 230 m/s
    tracking: { kind: 'observation', schemaVersion: 1, flightKey: 'x', identity: { status: 'confirmed', evidence: [] }, providerTimeSec: NOW, receivedAtSec: NOW, freshness: 'live', observation: { provider: 'airlabs', lat: 48.0, lon: 12.0, observedAtSec: NOW, groundSpeedMps: 230, trueTrackDeg: 300, onGround: false, altitudeM: 10000 } },
  })),
}));

import { clockAt, liveArrival } from '../src/services/live/arrival';

const record = { flightNumber: 'W69901', departureAirport: 'CRA', arrivalAirport: 'LTN', scheduledDeparture: '2026-10-31T08:40:00+02:00', scheduledArrival: '2026-10-31T10:05:00+00:00', gate: null, gateStatus: 'unconfirmed', dataSource: 'demo', lastUpdated: null } as never;

describe('landing estimate from the live position', () => {
  it('formats the clock at the destination offset', () => {
    expect(clockAt(Date.UTC(2026, 9, 31, 9, 5) / 1000, 0)).toBe('09:05');
    expect(clockAt(Date.UTC(2026, 9, 31, 9, 5) / 1000, 120)).toBe('11:05');
  });
  it('gives an estimate in the future with a progress between 0 and 1', async () => {
    const a = await liveArrival(record, NOW);
    expect(a).not.toBeNull();
    expect(a!.arrivalEpoch).toBeGreaterThan(NOW);
    expect(a!.progress).toBeGreaterThan(0);
    expect(a!.progress).toBeLessThan(1);
    expect(a!.arrivalTime).toMatch(/^\d{2}:\d{2}$/);
  });
});
