import { describe, expect, it } from 'vitest';
import { airlabsStatusFacts, offsetFrom, parseAirLabsFlight, readAirLabsError, toFlightRecord } from '../src/tracking/airlabs';
import { AirLabsClient, mapAirLabsError } from '../server/airlabsClient';
import { flightFacts, scheduledDuration } from '../src/core/flight';
import { airportTimeZone, localIso } from '../src/core/airports';

// Fictional payload (shape assumed from the docs field list; NOT a real AirLabs response).
const NOW = Date.parse('2026-10-31T09:00:00Z') / 1000;
const payload = (over: Record<string, unknown> = {}) => ({
  request: { id: 'x' },
  response: {
    hex: 'ABC123', flight_iata: 'XX123', flight_icao: 'XXX123', reg_number: 'YR-XXX',
    dep_iata: 'CRA', arr_iata: 'BGY', dep_terminal: '1', dep_gate: 'B4',
    dep_time: '2026-10-31 12:45', dep_time_utc: '2026-10-31 10:45',
    arr_time: '2026-10-31 14:10', arr_time_utc: '2026-10-31 13:10',
    status: 'scheduled', dep_delayed: 10, arr_delayed: null, duration: 145,
    lat: 44.1, lng: 23.2, alt: 9000, speed: 800, updated: NOW - 120,
    ...over,
  },
});
const SECRET = 'test-key-123';

describe('parseAirLabsFlight', () => {
  it('parses the wrapped and the bare shape', () => {
    expect(parseAirLabsFlight(payload()).flightIata).toBe('XX123');
    expect(parseAirLabsFlight(payload().response).hex).toBe('abc123');
  });
  it('keeps missing fields as null, never 0 or empty', () => {
    const f = parseAirLabsFlight(payload({ arr_delayed: undefined, dep_gate: '', speed: 'fast' }));
    expect(f.arrDelayedMin).toBeNull();
    expect(f.depGate).toBeNull();
    expect(f.speedRaw).toBeNull();
  });
  it('rejects unusable payloads', () => {
    expect(() => parseAirLabsFlight(null)).toThrow('airlabs_bad_payload');
    expect(() => parseAirLabsFlight(payload({ lat: 120 }))).toThrow('airlabs_bad_coordinates');
    expect(() => parseAirLabsFlight({ response: { dep_iata: 'CRA' } })).toThrow('airlabs_no_identity');
  });
  it('drops malformed codes and unknown statuses instead of trusting them', () => {
    const f = parseAirLabsFlight(payload({ dep_iata: 'CRAIOVA', hex: 'zzz', status: 'exploded', dep_time: 'soon' }));
    expect(f).toMatchObject({ depIata: null, hex: null, status: null, depTime: null });
  });
});

describe('readAirLabsError', () => {
  it('reads documented error objects', () => {
    expect(readAirLabsError({ error: { code: 'unknown_api_key', message: 'bad' } })).toEqual({ code: 'unknown_api_key', message: 'bad' });
    expect(readAirLabsError(payload())).toBeNull();
  });
  it('maps every documented code', () => {
    expect(mapAirLabsError('unknown_api_key')).toBe('auth_error');
    expect(mapAirLabsError('expired_api_key')).toBe('auth_error');
    for (const c of ['minute_limit_exceeded', 'hour_limit_exceeded', 'month_limit_exceeded']) expect(mapAirLabsError(c)).toBe('rate_limited');
    expect(mapAirLabsError('not_found')).toBe('not_found');
    expect(mapAirLabsError('wrong_params')).toBe('bad_request');
    expect(mapAirLabsError('internal_error')).toBe('provider_error');
  });
});

describe('time zones and FlightRecord', () => {
  it('derives offsets from local vs UTC', () => {
    expect(offsetFrom('2026-10-31 12:45', '2026-10-31 10:45')).toBe('+02:00');
    expect(offsetFrom('2026-10-31 14:10', '2026-10-31 13:10')).toBe('+01:00');
    expect(offsetFrom('2026-10-31 05:30', '2026-10-31 00:00')).toBe('+05:30');
    expect(offsetFrom('2026-10-31 12:00', '2026-10-30 12:00')).toBeNull(); // 24 h: implausible
    expect(offsetFrom(null, '2026-10-31 10:00')).toBeNull();
  });
  it('builds a FlightRecord whose duration is computed correctly across zones (2h25)', () => {
    const rec = toFlightRecord(parseAirLabsFlight(payload()), { nowSec: NOW })!;
    expect(rec.scheduledDeparture).toBe('2026-10-31T12:45:00+02:00');
    expect(rec.scheduledArrival).toBe('2026-10-31T14:10:00+01:00');
    expect(scheduledDuration(rec)?.minutes).toBe(145);
    expect(rec.dataSource).toBe('airlabs');
  });
  it('confirms the gate only when the data is fresh', () => {
    expect(toFlightRecord(parseAirLabsFlight(payload()), { nowSec: NOW })).toMatchObject({ gate: 'B4', gateStatus: 'confirmed' });
    const stale = toFlightRecord(parseAirLabsFlight(payload({ updated: NOW - 7200 })), { nowSec: NOW })!;
    expect(stale).toMatchObject({ gate: null, gateStatus: 'unconfirmed' });
    const noGate = toFlightRecord(parseAirLabsFlight(payload({ dep_gate: null })), { nowSec: NOW })!;
    expect(noGate.gate).toBeNull();
    const future = toFlightRecord(parseAirLabsFlight(payload({ updated: NOW + 9999 })), { nowSec: NOW })!;
    expect(future.gateStatus).toBe('unconfirmed'); // clock skew must not fake freshness
  });
  it('returns null (never invents times) when the schedule is missing', () => {
    expect(toFlightRecord(parseAirLabsFlight(payload({ arr_time: undefined, arr_time_utc: undefined })), { nowSec: NOW })).toBeNull();
    expect(toFlightRecord(parseAirLabsFlight(payload({ dep_iata: undefined })), { nowSec: NOW })).toBeNull();
  });
  it('unknown airports: arrival falls back to labelled UTC, never to the provider\'s local field', () => {
    const rec = toFlightRecord(parseAirLabsFlight(payload({ dep_iata: 'ZZA', arr_iata: 'ZZB', dep_time: undefined })), { nowSec: NOW })!;
    expect(rec.scheduledDeparture).toBe('2026-10-31T10:45:00Z'); // no local value, no known zone
    expect(rec.scheduledArrival).toBe('2026-10-31T13:10:00Z'); // UTC, even though arr_time was given
    expect(scheduledDuration(rec)?.minutes).toBe(145);
  });
  // Regression from a REAL AirLabs response (KL462 OTP->AMS, 2026-10-29): arr_time was 03:40 for 01:40 UTC, i.e. offset +2,
  // but Amsterdam is on UTC+1 that day. The UTC fields were consistent, the "local" arrival field was not.
  it('real response: arrival local time comes from UTC + the airport zone, not from arr_time', () => {
    const real = { hex: '48418A', flight_iata: 'KL462', dep_iata: 'OTP', arr_iata: 'AMS', dep_time: '2026-10-29 01:00', dep_time_utc: '2026-10-28 23:00',
      arr_time: '2026-10-29 03:40', arr_time_utc: '2026-10-29 01:40', dep_estimated: '2026-10-29 00:50', dep_estimated_utc: '2026-10-28 22:50',
      arr_estimated: '2026-10-29 03:23', arr_estimated_utc: '2026-10-29 01:23', duration: 160, status: 'landed', updated: NOW - 60 };
    const rec = toFlightRecord(parseAirLabsFlight({ response: real }), { nowSec: NOW })!;
    expect(rec.scheduledDeparture).toBe('2026-10-29T01:00:00+02:00'); // Bucharest, UTC+2
    expect(rec.scheduledArrival).toBe('2026-10-29T02:40:00+01:00'); // Amsterdam, UTC+1 (provider said 03:40)
    expect(rec.estimatedArrival).toBe('2026-10-29T02:23:00+01:00');
    expect(scheduledDuration(rec)?.minutes).toBe(160); // matches the provider's own duration
    expect(rec.providerStatus).toBe('landed');
  });
  it('DST is handled by the zone database, not by a fixed offset', () => {
    expect(localIso(Date.parse('2026-10-24T12:00:00Z'), 'Europe/Bucharest')).toBe('2026-10-24T15:00:00+03:00'); // still summer time
    expect(localIso(Date.parse('2026-10-26T12:00:00Z'), 'Europe/Bucharest')).toBe('2026-10-26T14:00:00+02:00'); // after the change on 25 Oct
    expect(airportTimeZone('ams')).toBe('Europe/Amsterdam');
    expect(airportTimeZone('XXX')).toBeNull();
  });
  it('the model sees the provider status, labelled third-party', () => {
    const rec = toFlightRecord(parseAirLabsFlight(payload({ status: 'landed' })), { nowSec: NOW })!;
    expect(flightFacts(rec, new Date(NOW * 1000))).toContain('provider status: landed (third-party, not an official statement)');
  });
  it('the model sees the source and an unknown gate, never a made-up one', () => {
    const rec = toFlightRecord(parseAirLabsFlight(payload({ dep_gate: null })), { nowSec: NOW })!;
    const facts = flightFacts(rec, new Date(NOW * 1000));
    expect(facts).toContain('gate: UNKNOWN');
    expect(facts).toContain('data source: airlabs');
  });
  it('status facts are attributed and mark unknown delays as UNKNOWN', () => {
    const facts = airlabsStatusFacts(parseAirLabsFlight(payload()), NOW);
    expect(facts).toContain('third-party data, not an official');
    expect(facts).toContain('arrival delay: UNKNOWN');
    expect(facts).toContain('departure delay: 10 min');
  });
});

describe('AirLabsClient (fake fetch, fake key)', () => {
  const resp = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
  const make = (handler: (u: URL) => Response) => {
    const urls: URL[] = [];
    const client = new AirLabsClient(SECRET, { fetchImpl: async (u) => { const url = new URL(String(u)); urls.push(url); return handler(url); } });
    return { client, urls };
  };

  it('sends flight_iata and api_key, and returns the parsed flight', async () => {
    const { client, urls } = make(() => resp(payload()));
    const r = await client.getFlightByIata('xx 123');
    expect(r.ok && r.flight.flightIata).toBe('XX123');
    expect(urls[0].pathname).toBe('/api/v9/flight');
    expect(urls[0].searchParams.get('flight_iata')).toBe('XX123');
    expect(urls[0].searchParams.get('api_key')).toBe(SECRET);
  });
  it('a 3-letter ICAO callsign (CPA253) is looked up as flight_icao, an IATA number still as flight_iata', async () => {
    const { client, urls } = make(() => resp(payload()));
    await client.getFlightByIata('cpa 253');
    expect(urls[0].searchParams.get('flight_icao')).toBe('CPA253');
    expect(urls[0].searchParams.has('flight_iata')).toBe(false);
    await client.getFlightByIata('W61234');
    expect(urls[1].searchParams.get('flight_iata')).toBe('W61234');
  });
  it('rejects malformed flight numbers and hex values before any request', async () => {
    const { client, urls } = make(() => resp(payload()));
    expect(await client.getFlightByIata('../../x')).toEqual({ ok: false, reason: 'bad_request' });
    expect(await client.getLiveByHex('xyz')).toEqual({ ok: false, reason: 'bad_request' });
    expect(urls).toHaveLength(0);
  });
  it.each([
    ['unknown_api_key', 'auth_error'], ['minute_limit_exceeded', 'rate_limited'], ['not_found', 'not_found'], ['internal_error', 'provider_error'],
  ])('maps API error %s -> %s (even on HTTP 200)', async (code, reason) => {
    const { client } = make(() => resp({ error: { code, message: 'x' } }));
    expect(await client.getFlightByIata('XX123')).toEqual({ ok: false, reason });
  });
  it('maps HTTP 429, 5xx and non-JSON bodies', async () => {
    expect(await make(() => resp({}, 429)).client.getFlightByIata('XX123')).toEqual({ ok: false, reason: 'rate_limited' });
    expect(await make(() => resp({ nope: 1 }, 500)).client.getFlightByIata('XX123')).toEqual({ ok: false, reason: 'provider_error' });
    expect(await make(() => new Response('<html>', { status: 200 })).client.getFlightByIata('XX123')).toEqual({ ok: false, reason: 'provider_error' });
  });
  it('/flights list: takes the first aircraft, empty list is not_found', async () => {
    const list = make(() => resp({ response: [payload().response] }));
    expect((await list.client.getLiveByHex('ABC123')).ok).toBe(true);
    expect(list.urls[0].searchParams.get('hex')).toBe('abc123');
    expect(await make(() => resp({ response: [] })).client.getLiveByHex('abc123')).toEqual({ ok: false, reason: 'not_found' });
  });
  it('network failures never leak the key', async () => {
    const client = new AirLabsClient(SECRET, { fetchImpl: async (u) => { throw new Error(`boom ${String(u)}`); } });
    const r = await client.getFlightByIata('XX123');
    expect(r).toEqual({ ok: false, reason: 'provider_error' });
    expect(JSON.stringify(r)).not.toContain(SECRET);
  });
  it('requires a key', () => {
    expect(() => new AirLabsClient('')).toThrow('airlabs_key_missing');
    expect(() => AirLabsClient.fromEnv({})).toThrow('airlabs_key_missing');
  });
});
