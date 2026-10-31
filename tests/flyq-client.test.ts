import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchFlight } from '../src/services/live/gatewayClient';
import { useLive } from '../src/store/live';

vi.mock('react-native', () => ({ Platform: { OS: 'ios' } }));
vi.mock('../src/store/storage', () => ({ zustandStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} } }));

const rec = { flightNumber: 'W43763', departureAirport: 'CRA', arrivalAirport: 'BGY', scheduledDeparture: '2026-10-31T12:45:00+02:00', scheduledArrival: '2026-10-31T14:10:00+01:00', gate: null, gateStatus: 'unconfirmed', dataSource: 'airlabs', lastUpdated: null };
const calls: Array<{ url: string; headers: Record<string, string> }> = [];
let sessionStatus = 201;
let flightStatuses: number[] = [200];

beforeEach(() => {
  calls.length = 0;
  sessionStatus = 201;
  flightStatuses = [200];
  useLive.setState({ backend: 'flyq', flyqKey: 'test-key-not-real', flyqSession: null });
  vi.stubGlobal('fetch', async (url: string, init: { headers?: Record<string, string> }) => {
    calls.push({ url, headers: init.headers ?? {} });
    if (url.endsWith('/v1/sessions')) return { ok: sessionStatus < 300, status: sessionStatus, json: async () => ({ token: 'ses_abc', expiresAt: new Date(Date.now() + 3600_000).toISOString() }) };
    const status = flightStatuses.shift() ?? 200;
    return { ok: status < 300, status, json: async () => ({ record: rec, tracking: null }) };
  });
});
afterEach(() => vi.unstubAllGlobals());

describe('FlyQ backend', () => {
  it('creates a session with the app key, then asks for the flight with the session token and today\'s date', async () => {
    const r = await fetchFlight('W4 3763');
    expect(r.record?.flightNumber).toBe('W43763');
    expect(calls[0].url).toBe('https://flyq-cra.duckdns.org/v1/sessions');
    expect(calls[0].headers['X-FlyQ-App-Key']).toBe('test-key-not-real');
    expect(calls[1].url).toMatch(/\/v1\/flights\/W43763\?date=\d{4}-\d{2}-\d{2}$/);
    expect(calls[1].headers.authorization).toBe('Bearer ses_abc');
  });
  it('reuses the session, and never sends the app key with a flight request', async () => {
    await fetchFlight('W43763');
    await fetchFlight('W43772');
    expect(calls.filter((c) => c.url.endsWith('/v1/sessions'))).toHaveLength(1);
    expect(calls.filter((c) => c.url.includes('/v1/flights/')).every((c) => !('X-FlyQ-App-Key' in c.headers))).toBe(true);
  });
  it('an expired session is replaced once and the request retried', async () => {
    flightStatuses = [401, 200];
    const r = await fetchFlight('W43763');
    expect(r.record?.flightNumber).toBe('W43763');
    expect(calls.filter((c) => c.url.endsWith('/v1/sessions'))).toHaveLength(2);
  });
  it('without a key it fails as unauthorized and sends nothing', async () => {
    useLive.setState({ flyqKey: '' });
    await expect(fetchFlight('W43763')).rejects.toThrow('unauthorized');
    expect(calls).toHaveLength(0);
  });
});
