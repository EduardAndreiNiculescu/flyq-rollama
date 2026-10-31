import { describe, expect, it } from 'vitest';
import { decodeState, parseStatesResponse, type Observation } from '../src/tracking/opensky';
import { distanceAndBearing, roughEta } from '../src/tracking/eta';
import { parseTrackingResult } from '../src/tracking/result';
import { trackingFacts } from '../src/tracking/context';
import { OpenSkyClient } from '../server/openskyClient';

// Fictional 17-field state vector (indexes per OpenSky docs).
const row = (over: Record<number, unknown> = {}) => {
  const r: unknown[] = ['abc123', 'TEST1  ', 'Romania', 1000, 1000, 23.0, 44.0, 9000, false, 220, 90, 0, null, 9100, null, false, 0];
  Object.entries(over).forEach(([i, v]) => (r[Number(i)] = v));
  return r;
};
const obs = (over: Partial<Observation> = {}): Observation => ({ ...decodeState(row()), ...over });

describe('decodeState', () => {
  it('decodes a valid row and trims the callsign', () => {
    const o = decodeState(row());
    expect(o).toMatchObject({ icao24: 'abc123', callsign: 'TEST1', lat: 44, lon: 23, onGround: false, groundSpeedMps: 220 });
  });
  it('keeps null as null, never 0', () => {
    expect(decodeState(row({ 9: null, 5: null, 6: null })).groundSpeedMps).toBeNull();
  });
  it('rejects malformed rows', () => {
    expect(() => decodeState(row().slice(0, 10))).toThrow('bad_state_shape');
    expect(() => decodeState(row({ 0: 'xyz' }))).toThrow('bad_icao24');
    expect(() => decodeState(row({ 6: 95 }))).toThrow('bad_coordinates');
    expect(() => decodeState(row({ 9: -1 }))).toThrow('bad_speed');
    expect(() => decodeState(row({ 4: 1000.5 }))).toThrow('bad_time');
    expect(() => decodeState(row({ 9: NaN })).groundSpeedMps).not.toThrow();
  });
  it('states:null means no observation', () => {
    expect(parseStatesResponse({ time: 5, states: null }).observations).toEqual([]);
  });
});

describe('ETA', () => {
  const airport = { lat: 45, lon: 23 };
  it('distance is zero for identical points and uses the short arc over the antimeridian', () => {
    expect(distanceAndBearing({ lat: 44, lon: 23 }, { lat: 44, lon: 23 }).distanceKm).toBeCloseTo(0);
    expect(distanceAndBearing({ lat: 0, lon: 179.9 }, { lat: 0, lon: -179.9 }).distanceKm).toBeLessThan(25);
  });
  it('estimates when heading towards the airport', () => {
    const r = roughEta(obs({ lat: 44, lon: 23, trueTrackDeg: 0, groundSpeedMps: 200 }), airport, 1010, 120, 1.1);
    expect(r.kind).toBe('estimate');
    if (r.kind === 'estimate') {
      expect(r.calibrated).toBe(false);
      expect(r.seconds).toBeGreaterThan(500);
    }
  });
  it.each([
    ['on ground', { onGround: true }, 'on_ground'],
    ['stale', { observedAtSec: 100 }, 'stale_or_future_position'],
    ['no speed', { groundSpeedMps: null }, 'missing_motion'],
    ['flying away', { trueTrackDeg: 180 }, 'not_progressing'],
    ['no position', { lat: null }, 'missing_position'],
  ])('refuses: %s', (_n, over, reason) => {
    expect(roughEta(obs({ trueTrackDeg: 0, ...over } as Partial<Observation>), airport, 1010, 120, 1.1)).toEqual({ kind: 'unavailable', reason });
  });
  it('refuses when final approach is too close', () => {
    expect(roughEta(obs({ lat: 44.99, lon: 23, trueTrackDeg: 0 }), airport, 1010, 120, 1.1)).toEqual({ kind: 'unavailable', reason: 'final_approach' });
  });
});

describe('parseTrackingResult', () => {
  const ok = { kind: 'observation', schemaVersion: 1, flightKey: 'F1', identity: { status: 'confirmed', evidence: [] }, observation: decodeState(row()), providerTimeSec: 1, receivedAtSec: 2, freshness: 'live' };
  it('accepts valid payloads', () => {
    expect(parseTrackingResult(ok).kind).toBe('observation');
    expect(parseTrackingResult({ kind: 'unavailable', schemaVersion: 1, reason: 'no_coverage', checkedAtSec: 1 }).kind).toBe('unavailable');
  });
  it('rejects wrong schema, kind, reason and coordinates', () => {
    expect(() => parseTrackingResult({ ...ok, schemaVersion: 2 })).toThrow('unsupported_schema');
    expect(() => parseTrackingResult({ ...ok, kind: 'x' })).toThrow('bad_kind');
    expect(() => parseTrackingResult({ kind: 'unavailable', schemaVersion: 1, reason: 'cancelled', checkedAtSec: 1 })).toThrow('bad_unavailable');
    expect(() => parseTrackingResult({ ...ok, observation: { ...ok.observation, lat: 120 } })).toThrow('bad_coordinates');
  });
});

describe('trackingFacts', () => {
  it('never lets absence of data imply cancellation', () => {
    const t = { kind: 'unavailable', schemaVersion: 1, reason: 'no_coverage', checkedAtSec: 1 } as const;
    expect(trackingFacts(t, null, 10)).toMatch(/do not infer delay, cancellation or landing/);
  });
});

describe('OpenSkyClient (fake fetch, no network, fake credentials)', () => {
  const json = (b: unknown, s = 200, h: Record<string, string> = {}) => new Response(JSON.stringify(b), { status: s, headers: h });
  const make = (handler: (url: string, n: number) => Response) => {
    let n = 0;
    const calls: string[] = [];
    const client = new OpenSkyClient({ clientId: 'test-id', clientSecret: 'test-secret' }, {
      fetchImpl: async (u) => { calls.push(String(u)); return handler(String(u), n++); },
    });
    return { client, calls };
  };
  const tokenOr = (data: () => Response) => (u: string) => (u.includes('openid-connect/token') ? json({ access_token: 't', expires_in: 1800 }) : data());

  it('reuses the token and filters rows by icao24', async () => {
    const { client, calls } = make(tokenOr(() => json({ time: 1, states: [row(), row({ 0: 'def456' })] })));
    const a = await client.getStateByIcao24('abc123');
    await client.getStateByIcao24('abc123');
    expect(a.ok && a.observations.map((o) => o.icao24)).toEqual(['abc123']);
    expect(calls.filter((c) => c.includes('token'))).toHaveLength(1);
  });
  it('maps 429 with retry-after and never throws', async () => {
    const { client } = make(tokenOr(() => json({}, 429, { 'x-rate-limit-retry-after-seconds': '42' })));
    expect(await client.getStateByIcao24('abc123')).toEqual({ ok: false, reason: 'rate_limited', retryAfterSec: 42 });
  });
  it('refreshes once on 401 then reports auth_error on a second 401', async () => {
    const { client, calls } = make(tokenOr(() => json({}, 401)));
    expect(await client.getStateByIcao24('abc123')).toEqual({ ok: false, reason: 'auth_error' });
    expect(calls.filter((c) => c.includes('token'))).toHaveLength(2);
  });
  it('rejects invalid icao24 before any request', async () => {
    const { client, calls } = make(() => json({}));
    await expect(client.getStateByIcao24('../etc')).rejects.toThrow('bad_icao24');
    expect(calls).toHaveLength(0);
  });
  it('fromEnv requires credentials', () => {
    expect(() => OpenSkyClient.fromEnv({})).toThrow('opensky_credentials_missing');
  });
});
