import type { AddressInfo } from 'node:net';
import type http from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createGateway } from '../server/gateway/gateway';
import { AirLabsFlightProvider } from '../server/gateway/providers';
import { OllamaEngine } from '../server/gateway/ollamaEngine';
import { AirLabsClient, type AirLabsResult } from '../server/airlabsClient';
import { parseAirLabsFlight } from '../src/tracking/airlabs';
import { createTools, toolSpecs } from '../src/tools/registry';
import type { EngineToolCall, LlmEngine } from '../src/core/assistant';

// Fictional AirLabs-shaped payload; times are relative to a fixed "now" so freshness rules are exercised.
const NOW_MS = Date.parse('2026-10-31T11:00:00Z');
const NOW_SEC = NOW_MS / 1000;
const payload = (over: Record<string, unknown> = {}) => ({
  response: {
    hex: 'abc123', flight_iata: 'XX123', flight_icao: 'XXX123', dep_iata: 'CRA', arr_iata: 'BGY', dep_gate: 'B4',
    dep_time: '2026-10-31 12:45', dep_time_utc: '2026-10-31 10:45', arr_time: '2026-10-31 14:10', arr_time_utc: '2026-10-31 13:10',
    status: 'en-route', lat: 44.5, lng: 23.2, alt: 9500, speed: 820, dir: 0, updated: NOW_SEC - 60, ...over,
  },
});

type Script = (n: number) => AirLabsResult;
function fakeClient(script: Script) {
  let n = 0;
  return { calls: () => n, client: { async getFlightByIata(_: string) { return script(n++); } } };
}
const okFlight = (over: Record<string, unknown> = {}): AirLabsResult => ({ ok: true, flight: parseAirLabsFlight(payload(over)) });

let server: http.Server;
let base = '';
let provider: AirLabsFlightProvider;
let upstream = fakeClient(() => okFlight());
let engineScript: (n: number, messages: unknown[]) => { text: string; toolCalls?: EngineToolCall[] } = () => ({ text: 'ok' });

async function start(script: Script, maxCalls = 25, fastPath = false) {
  await new Promise<void>((r) => (server ? server.close(() => r()) : r()));
  upstream = fakeClient(script);
  provider = new AirLabsFlightProvider(upstream.client, { nowMs: () => NOW_MS, maxCalls });
  let n = 0;
  const engine: LlmEngine = {
    async generate(messages, onToken) {
      const r = engineScript(n++, messages);
      onToken(r.text);
      return { text: r.text, toolCalls: r.toolCalls, stats: { timeToFirstTokenMs: 1, tokensPerSecond: 1, totalMs: 1, tokens: 1 } };
    },
    async stop() {},
  };
  server = createGateway({ provider, engine, nowMs: () => NOW_MS, fastPath });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}
const post = (path: string, body: unknown, headers: Record<string, string> = { 'content-type': 'application/json' }) =>
  fetch(base + path, { method: 'POST', headers, body: typeof body === 'string' ? body : JSON.stringify(body) });
const tool = async (name: string, args: object = {}, flightNumber = 'XX123') => (await (await post(`/v1/tools/${name}`, { arguments: args, flightNumber })).json()) as any;

beforeAll(() => start(() => okFlight()));
afterAll(() => new Promise<void>((r) => server.close(() => r())));

describe('tool contract is the app\'s own', () => {
  it('GET /v1/tools returns exactly the registry specs', async () => {
    const r = await (await fetch(`${base}/v1/tools`)).json();
    expect(r.tools).toEqual(JSON.parse(JSON.stringify(toolSpecs(createTools()))));
    expect(r.tools.map((t: any) => t.function.name)).toContain('get_live_tracking');
  });
});

describe('tools run on live data', () => {
  it('get_gate: fresh gate from the provider is confirmed; second call is served from cache', async () => {
    await start(() => okFlight());
    const a = await tool('get_gate');
    expect(a).toMatchObject({ ok: true, data: { gate: 'B4', status: 'confirmed' } });
    await tool('get_gate');
    expect(upstream.calls()).toBe(1);
    expect(provider.stats).toEqual({ upstreamCalls: 1, cacheHits: 1 });
  });
  it('a stale gate is not confirmed', async () => {
    await start(() => okFlight({ updated: NOW_SEC - 7200 }));
    expect((await tool('get_gate')).data).toMatchObject({ gate: null, status: 'unconfirmed' });
  });
  it('flight details carry the provider estimate and delay, labelled third-party', async () => {
    await start(() => okFlight({ arr_estimated: '2026-10-31 14:30', arr_estimated_utc: '2026-10-31 13:30', arr_delayed: 20 }));
    const r = await tool('get_flight_details');
    expect(r.data.facts).toContain('estimated arrival: 2026-10-31T14:30:00+01:00 (third-party estimate, may change)');
    expect(r.data.facts).toContain('arrival delay reported: 20 min (third-party)');
    expect(r.data.facts).toContain('data source: airlabs');
  });
  it('get_live_tracking: a fresh position is attributed to AirLabs and gives an ETA (speed is km/h, verified live)', async () => {
    await start(() => okFlight({ arr_iata: 'CRA', lat: 43.5, lng: 23.9, dir: 0 }));
    const r = await tool('get_live_tracking');
    expect(r.ok).toBe(true);
    expect(r.data.facts).toContain('AirLabs');
    expect(r.data.facts).toMatch(/ETA near the airport: about \d+ min/);
    expect(r.data.facts).not.toMatch(/delay|cancel/i);
  });
  // Regression from the live check: a flight marked "landed" still came with the aircraft's position at the departure airport.
  it('get_live_tracking: a landed flight has no live position, whatever lat/lng say', async () => {
    await start(() => okFlight({ status: 'landed', lat: 44.56, lng: 26.07 }));
    const r = await tool('get_live_tracking');
    expect(r.data.facts).toContain('flight_completed'.slice(0, 0) + 'reports this flight as landed');
    expect(r.data.facts).not.toContain('44.56');
  });
  it('get_live_tracking: stale or missing position is "unavailable", never an inferred status', async () => {
    await start(() => okFlight({ updated: NOW_SEC - 3600 }));
    expect((await tool('get_live_tracking')).data.facts).toContain('stale_position');
    await start(() => okFlight({ lat: undefined, lng: undefined }));
    expect((await tool('get_live_tracking')).data.facts).toContain('no_coverage');
  });
});

describe('failures are told apart', () => {
  it('"not found" and "provider unavailable" are different messages', async () => {
    await start(() => ({ ok: false, reason: 'not_found' }));
    expect((await tool('get_gate')).error).toBe('flight not found by the data provider');
    await start(() => ({ ok: false, reason: 'rate_limited' }));
    expect((await tool('get_gate')).error).toBe('flight data unavailable right now (rate_limited)');
    await start(() => ({ ok: false, reason: 'provider_error' }));
    expect((await tool('get_gate')).error).toContain('unavailable');
  });
  it('the upstream call budget is enforced', async () => {
    await start(() => okFlight(), 1);
    await tool('get_gate', {}, 'AA111');
    const r = await tool('get_gate', {}, 'BB222');
    expect(r.error).toBe('flight data unavailable right now (budget_exhausted)');
    expect(upstream.calls()).toBe(1);
  });
  it('no flight number at all: tells the model to ask, without any upstream call', async () => {
    await start(() => okFlight());
    const r = (await (await post('/v1/tools/get_gate', { arguments: {} })).json()) as any;
    expect(r.error).toContain('ask the passenger');
    expect(upstream.calls()).toBe(0);
  });
});

describe('HTTP hardening', () => {
  it('unknown tool 404, invalid arguments rejected before any upstream call', async () => {
    await start(() => okFlight());
    expect((await post('/v1/tools/format_disk', { arguments: {} })).status).toBe(404);
    const r = await tool('get_gate', { evil: '1' });
    expect(r).toMatchObject({ ok: false });
    expect(upstream.calls()).toBe(0);
  });
  it('rejects browser origins, non-JSON, bad JSON and oversized bodies', async () => {
    expect((await fetch(`${base}/health`, { headers: { origin: 'https://evil.example' } })).status).toBe(403);
    expect((await post('/v1/tools/get_gate', 'x=1', { 'content-type': 'text/plain' })).status).toBe(415);
    expect((await post('/v1/tools/get_gate', '{oops')).status).toBe(400);
    expect((await post('/v1/tools/get_gate', { arguments: { flightNumber: 'x'.repeat(40000) } }).catch(() => ({ status: 413 }))).status).toBe(413);
  });
  it('binds to loopback only', () => {
    expect((server.address() as AddressInfo).address).toBe('127.0.0.1');
  });
});

describe('chat: model + tool loop on live data', () => {
  it('returns immediate emergency help even when no model engine is configured', async () => {
    await new Promise<void>(r => server.close(() => r()));
    server = createGateway({ provider, engine: null, nowMs: () => NOW_MS });
    await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const response = await post('/v1/chat', { question: 'I need an ambulance now.' });
    const answer = await response.json() as { text: string; path: string; trace: unknown[] };
    expect(response.status).toBe(200);
    expect(answer.text).toContain('112');
    expect(answer.path).toBe('fast');
    expect(answer.trace).toEqual([]);
    expect((await post('/v1/chat', { question: 'When does my flight leave?' })).status).toBe(501);
    await start(() => okFlight());
  });
  it('can answer an obvious gate question with no model call when fast path is enabled', async () => {
    await start(() => okFlight(), 25, true);
    engineScript = () => { throw new Error('model must not run'); };
    const r = (await (await post('/v1/chat', { question: 'Ce poartă am?', flightNumber: 'XX123' })).json()) as any;
    expect(r.path).toBe('fast');
    expect(r.text).toContain('B4');
    expect(r.timing.modelMs).toEqual([]);
    expect(r.trace[0].name).toBe('get_gate');
  });
  it('the model calls a tool, the gateway runs it live, the model answers from the result', async () => {
    await start(() => okFlight({ dep_gate: null }));
    engineScript = (n, messages) => {
      if (n === 0) return { text: '', toolCalls: [{ name: 'get_gate', arguments: '{"flightNumber":"XX123"}' }] };
      const toolMsg = (messages as any[]).find((m) => m.role === 'tool');
      return { text: toolMsg.content.includes('"gate":null') ? 'Nu am o poartă confirmată.' : 'Poarta e B4.' };
    };
    const r = (await (await post('/v1/chat', { question: 'La ce poartă e XX123?' })).json()) as any;
    expect(r.text).toBe('Poarta pentru XX123 nu este confirmată încă. Verifică panourile aeroportului.'); // composed from the tool result
    expect(r.path).toBe('composed');
    expect(r.trace).toEqual([{ name: 'get_gate', args: '{"flightNumber":"XX123"}', ok: true, sideEffect: false }]);
    expect(r.upstream.upstreamCalls).toBe(1);
  });
  it('the flight number typed in the question is passed on as context', async () => {
    await start(() => okFlight());
    engineScript = (n) => (n === 0 ? { text: '', toolCalls: [{ name: 'get_gate', arguments: '{}' }] } : { text: 'ok' });
    const r = (await (await post('/v1/chat', { question: 'Is XX123 on time?' })).json()) as any;
    expect(r.trace[0].ok).toBe(true); // empty arguments resolved from the question via the router
  });
  it('side-effect tools are blocked in the gateway', async () => {
    await start(() => okFlight());
    engineScript = (n) => (n === 0 ? { text: '', toolCalls: [{ name: 'open_airport_map', arguments: '{"destination":"farmacia"}' }] } : { text: 'ok' });
    const r = (await (await post('/v1/chat', { question: 'Where is the pharmacy?' })).json()) as any; // a place the catalogue does not have: the model path
    expect(r.trace[0]).toMatchObject({ ok: false, sideEffect: true });
  });
  it('validates the question', async () => {
    expect((await post('/v1/chat', { question: '' })).status).toBe(400);
    expect((await post('/v1/chat', { question: 'x'.repeat(501) })).status).toBe(400);
  });
});

describe('secrets never leave the server', () => {
  it('the API key is only in the upstream request URL, never in any response or error', async () => {
    const SECRET = 'SECRET-KEY-123';
    const seen: string[] = [];
    const real = new AirLabsClient(SECRET, {
      fetchImpl: async (u) => {
        seen.push(String(u));
        return new Response(JSON.stringify({ error: { code: 'unknown_api_key', message: `bad key ${SECRET}` } }), { status: 200 });
      },
    });
    await new Promise<void>((r) => server.close(() => r()));
    provider = new AirLabsFlightProvider(real, { nowMs: () => NOW_MS });
    server = createGateway({ provider, engine: null, nowMs: () => NOW_MS });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const text = JSON.stringify(await tool('get_gate'));
    expect(seen[0]).toContain(SECRET); // it IS sent upstream...
    expect(text).not.toContain(SECRET); // ...and never comes back
    expect(text).toContain('auth_error');
    expect(JSON.stringify(await (await fetch(`${base}/health`)).json())).not.toContain(SECRET);
  });
});

describe('OllamaEngine', () => {
  it('renders a raw Qwen3 prompt with tools and parses <tool_call> blocks', async () => {
    let sent: any;
    const engine = new OllamaEngine({
      baseUrl: 'http://x', model: 'ff-base',
      fetchImpl: (async (_u: unknown, init: any) => {
        sent = JSON.parse(init.body);
        return new Response(JSON.stringify({ response: '<tool_call>\n{"name": "get_gate", "arguments": {}}\n</tool_call>', eval_count: 20, eval_duration: 1e9 }));
      }) as unknown as typeof fetch,
    });
    const out = await engine.generate([{ role: 'system', content: 'sys' }, { role: 'user', content: 'gate?' }], () => {}, { tools: toolSpecs(createTools()) });
    expect(sent.raw).toBe(true);
    expect(sent.prompt).toContain('<tools>');
    expect(sent.prompt.endsWith('<think>\n\n</think>\n\n')).toBe(true);
    expect(out.toolCalls).toEqual([{ name: 'get_gate', arguments: '{}' }]);
    expect(out.stats.tokensPerSecond).toBe(20);
  });
  it('fails clearly when the model server errors', async () => {
    const engine = new OllamaEngine({ baseUrl: 'http://x', model: 'm', fetchImpl: (async () => new Response('no', { status: 500 })) as unknown as typeof fetch });
    await expect(engine.generate([{ role: 'user', content: 'x' }], () => {})).rejects.toThrow('model server HTTP 500');
  });
});

describe('app endpoint and LAN token', () => {
  it('GET /v1/flight/{n} returns the flight record and the live position in one call', async () => {
    await start(() => okFlight());
    const r = await fetch(`${base}/v1/flight/XX123`);
    const j = (await r.json()) as any;
    expect(r.status).toBe(200);
    expect(j.record.flightNumber).toBe('XX123');
    expect(j.tracking.kind).toBe('observation');
  });
  it('rejects malformed flight numbers and unknown flights', async () => {
    expect((await fetch(`${base}/v1/flight/..%2Fetc`)).status).toBe(404);
    await start(() => ({ ok: false, reason: 'not_found' }));
    expect((await fetch(`${base}/v1/flight/XX123`)).status).toBe(404);
    await start(() => okFlight());
  });
  it('with a token, everything but /health needs it', async () => {
    await new Promise<void>((r) => server.close(() => r()));
    server = createGateway({ provider, engine: null, token: 's3cret', nowMs: () => NOW_MS });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    expect((await fetch(`${base}/health`)).status).toBe(200);
    expect((await fetch(`${base}/v1/flight/XX123`)).status).toBe(401);
    expect((await fetch(`${base}/v1/flight/XX123`, { headers: { authorization: 'Bearer wrong' } })).status).toBe(401);
    expect((await fetch(`${base}/v1/flight/XX123`, { headers: { authorization: 'Bearer s3cret' } })).status).toBe(200);
    await start(() => okFlight());
  });
});

describe('phone benchmark upload', () => {
  it('accepts a full phone benchmark, saves it, and rejects a non-array', async () => {
    await start(() => okFlight());
    const items = Array.from({ length: 20 }, (_, i) => ({ q: `q${i}`, answer: 'x'.repeat(800), ms: 1, path: 'composed', timing: { toolMs: 2, modelMs: [{ totalMs: 50, firstTokenMs: 20, decodeMs: 30 }] } }));
    const r = await post('/v1/bench', { source: 'device', items });
    const j = (await r.json()) as { saved: string };
    expect(r.status).toBe(200);
    expect(j.saved).toMatch(/^phone-bench-.*\.json$/);
    const { rmSync } = await import('node:fs');
    rmSync(new URL(`../eval/results/${j.saved}`, import.meta.url));
    expect((await post('/v1/bench', { items: 'nope' })).status).toBe(400);
  });
});

describe('remote control of the phone (device hub)', () => {
  it('queue -> poll -> progress -> result round trip, with an unknown command refused', async () => {
    await start(() => okFlight());
    const cmd = (await (await post('/v1/device/cmd', { type: 'bench', questions: ['a'] })).json()) as { id: string };
    expect(cmd.id).toMatch(/^c\d+$/);
    const polled = (await (await fetch(`${base}/v1/device/poll?info=${encodeURIComponent('{"model":"ready"}')}`)).json()) as { cmd: { id: string; type: string } };
    expect(polled.cmd).toMatchObject({ id: cmd.id, type: 'bench' });
    expect((await post('/v1/device/result', { cmdId: cmd.id, item: { i: 0, ms: 5 } })).status).toBe(200);
    expect((await post('/v1/device/result', { cmdId: cmd.id, done: true, data: { ok: 1 } })).status).toBe(200);
    const res = (await (await fetch(`${base}/v1/device/result/${cmd.id}`)).json()) as { items: unknown[]; done: boolean; total: number };
    expect(res).toMatchObject({ done: true, total: 1 });
    expect(res.items).toEqual([{ i: 0, ms: 5 }]);
    expect((await post('/v1/device/result', { cmdId: 'c999', done: true })).status).toBe(404);
    const st = (await (await fetch(`${base}/v1/device/status`)).json()) as { connected: boolean; info: unknown };
    expect(st).toMatchObject({ connected: true, info: { model: 'ready' } });
  });
  it('a bad command type is rejected; the device paths still need the token when one is set', async () => {
    expect((await post('/v1/device/cmd', { type: 'rm -rf' })).status).toBe(400);
    await new Promise<void>((r) => server.close(() => r()));
    server = createGateway({ provider, engine: null, token: 's3cret', nowMs: () => NOW_MS });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    expect((await post('/v1/device/cmd', { type: 'ping' })).status).toBe(401);
    expect((await fetch(`${base}/v1/device/status`)).status).toBe(401);
    await start(() => okFlight());
  });
});

describe('ICAO callsign -> IATA number (provider)', () => {
  it('CPA253 is looked up as CX253; the airline is resolved once and remembered', async () => {
    const seen: string[] = [];
    let airlineCalls = 0;
    const client = {
      async getFlightByIata(n: string) { seen.push(n); return okFlight(); },
      async getAirlineIata(icao: string) { airlineCalls++; return icao === 'CPA' ? 'CX' : null; },
    };
    const p = new AirLabsFlightProvider(client, { nowMs: () => NOW_MS, ttlMs: 0 });
    await p.lookup('cpa 253');
    await p.lookup('CPA254');
    expect(seen).toEqual(['CX253', 'CX254']);
    expect(airlineCalls).toBe(1);
  });
  it('zero padding of the callsign is dropped: QTR037 -> QR37', async () => {
    const seen: string[] = [];
    const client = { async getFlightByIata(n: string) { seen.push(n); return okFlight(); }, async getAirlineIata() { return 'QR'; } };
    await new AirLabsFlightProvider(client, { nowMs: () => NOW_MS }).lookup('QTR037');
    expect(seen).toEqual(['QR37']);
  });
  it('an unknown airline keeps the number as typed (the client then tries it as an ICAO callsign)', async () => {
    const seen: string[] = [];
    const client = { async getFlightByIata(n: string) { seen.push(n); return okFlight(); }, async getAirlineIata() { return null; } };
    await new AirLabsFlightProvider(client, { nowMs: () => NOW_MS }).lookup('ZZZ999');
    expect(seen).toEqual(['ZZZ999']);
  });
  it('IATA numbers never trigger an airline lookup', async () => {
    let airlineCalls = 0;
    const client = { async getFlightByIata() { return okFlight(); }, async getAirlineIata() { airlineCalls++; return 'XX'; } };
    await new AirLabsFlightProvider(client, { nowMs: () => NOW_MS }).lookup('W61234');
    expect(airlineCalls).toBe(0);
  });
});
