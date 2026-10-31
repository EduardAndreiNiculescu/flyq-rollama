import { beforeEach, describe, expect, it, vi } from 'vitest';

const NOW = 1_800_000_000;
const mocks = vi.hoisted(() => ({ serverEta: vi.fn() }));
vi.mock('../src/services/live/gatewayClient', () => ({
  fetchServerEta: mocks.serverEta,
  fetchFlight: vi.fn(async () => ({
    record: null,
    // about halfway between Craiova and Luton, flying north-west at 230 m/s
    tracking: { kind: 'observation', schemaVersion: 1, flightKey: 'x', identity: { status: 'confirmed', evidence: [] }, providerTimeSec: NOW, receivedAtSec: NOW, freshness: 'live', observation: { provider: 'airlabs', lat: 48.0, lon: 12.0, observedAtSec: NOW, groundSpeedMps: 230, trueTrackDeg: 300, onGround: false, altitudeM: 10000 } },
  })),
}));

import { clearArrivalCache, clockAt, liveArrival } from '../src/services/live/arrival';

const record = { flightNumber: 'W69901', departureAirport: 'CRA', arrivalAirport: 'LTN', scheduledDeparture: '2026-10-31T08:40:00+02:00', scheduledArrival: '2026-10-31T10:05:00+00:00', gate: null, gateStatus: 'unconfirmed', dataSource: 'demo', lastUpdated: null } as never;

describe('landing estimate', () => {
  beforeEach(() => {
    clearArrivalCache();
    mocks.serverEta.mockReset();
    mocks.serverEta.mockResolvedValue(null);
  });

  it('formats the clock at the destination offset', () => {
    expect(clockAt(Date.UTC(2026, 9, 31, 9, 5) / 1000, 0)).toBe('09:05');
    expect(clockAt(Date.UTC(2026, 9, 31, 9, 5) / 1000, 120)).toBe('11:05');
  });

  it("falls back to the app's own model from the live position when the server has no ETA", async () => {
    const a = await liveArrival(record, NOW);
    expect(a).not.toBeNull();
    expect(a!.source).toBe('local');
    expect(a!.arrivalEpoch).toBeGreaterThan(NOW);
    expect(a!.progress).toBeGreaterThan(0);
    expect(a!.progress).toBeLessThan(1);
    expect(a!.arrivalTime).toMatch(/^\d{2}:\d{2}$/);
  });

  it("prefers the server's ETA and keeps its kind and the wind attribution", async () => {
    mocks.serverEta.mockResolvedValue({ eta: { etaUtc: '2026-10-31T10:20:00Z', kind: 'position_estimate' }, positionModel: { distanceM: 800_000, windSource: 'Weather data by Open-Meteo.com (CC BY 4.0)' } });
    const a = await liveArrival(record, NOW);
    expect(a!.source).toBe('server');
    expect(a!.kind).toBe('position_estimate');
    expect(a!.arrivalTime).toBe('10:20'); // destination clock, offset +00:00
    expect(a!.arrivalEpoch).toBe(Date.parse('2026-10-31T10:20:00Z') / 1000);
    expect(a!.attribution).toMatch(/Open-Meteo/);
    expect(a!.progress).toBeGreaterThan(0);
    expect(a!.progress).toBeLessThan(1);
  });

  it('does not trust a server answer that is only the schedule', async () => {
    mocks.serverEta.mockResolvedValue({ eta: { etaUtc: '2026-10-31T10:05:00Z', kind: 'scheduled' } });
    const a = await liveArrival(record, NOW);
    expect(a!.source).toBe('local');
  });

  it('uses the fallback when the server errors', async () => {
    mocks.serverEta.mockRejectedValue(new Error('upstream'));
    const a = await liveArrival(record, NOW);
    expect(a!.source).toBe('local');
  });
});
