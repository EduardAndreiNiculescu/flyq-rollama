import { describe, expect, it } from 'vitest';
import { near, routeIntents } from '../src/core/router';
import { flightAnswer, flightQuestionType } from '../src/core/templates';
import { roughEta } from '../src/tracking/eta';
import { decodeState, type Observation } from '../src/tracking/opensky';
import { parseAirLabsFlight, toFlightRecord } from '../src/tracking/airlabs';
import { flightFacts, timeRemaining } from '../src/core/flight';
import { validateArgs } from '../src/tools/schema';
import { createTools } from '../src/tools/registry';
import { runToolLoop } from '../src/tools/loop';
import { OpenSkyClient } from '../server/openskyClient';
import type { ChatMessage, EngineToolCall, LlmEngine } from '../src/core/assistant';

// Regression tests for the verified findings of the read-only review.

const first = (q: string) => routeIntents(q)[0];
const names = (q: string) => routeIntents(q).map((i) => i.intent);

describe('router: prefix matching must not turn unrelated words into trigger words', () => {
  it('"understand" is not the trigger "unde"; "department" is not "departure"', () => {
    expect(near('understand', 'unde')).toBe(false);
    expect(near('undeva', 'unde')).toBe(true);
    expect(names("I don't understand the baggage rules")).toEqual(['GET_BAGGAGE_GUIDANCE']);
    expect(names('Where is the department store?')).toEqual(['OPEN_AIRPORT_MAP']);
    expect(flightQuestionType('Where is the department store?')).toBeNull();
  });
  it('real departure wording still works', () => {
    expect(first('What is the departure time?').intent).toBe('GET_FLIGHT_DETAILS');
    expect(first('When does my flight depart?').intent).toBe('GET_FLIGHT_DETAILS');
    expect(flightQuestionType('What is the departure time?')).toBe('departure');
  });
  it('typo tolerance for the triggers is preserved', () => {
    expect(first('Une este baia n aeroport')).toEqual({ intent: 'OPEN_AIRPORT_MAP', args: { destination: 'toaleta' } });
    expect(first('wher is the bathrom').intent).toBe('OPEN_AIRPORT_MAP');
  });
});

describe('router: flight number pattern', () => {
  it('does not treat COVID19, MP3 or a gate like B12 as a flight number', () => {
    expect(routeIntents('Is a COVID19 test needed?')).toEqual([{ intent: 'GENERAL_QUESTION', args: {} }]);
    expect(names('The gate is B12')).toEqual(['GENERAL_QUESTION']);
    expect(first('I lost my MP3 player').intent).toBe('GENERAL_QUESTION');
  });
  it('accepts IATA, digit-carrier, ICAO and demo numbers', () => {
    expect(first('Is RO123 on time?').args).toEqual({ flightNumber: 'RO123' });
    expect(first('Is W61234 delayed?').args).toEqual({ flightNumber: 'W61234' });
    expect(first('When does TAR123 land?').args).toEqual({ flightNumber: 'TAR123' });
    expect(first('When does DEMO123 land?').args).toEqual({ flightNumber: 'DEMO123' });
  });
});

describe('ETA accounts for the age of the position', () => {
  const obs = (age: number): Observation => ({ ...decodeState(['abc123', null, 'X', 1000, 1000, 23, 44, 9000, false, 200, 0, 0, null, null, null, false, 0]), observedAtSec: 1000 - age });
  const airport = { lat: 45, lon: 23 };
  it('an older observation gives a smaller remaining time, by exactly that age', () => {
    const fresh = roughEta(obs(0), airport, 1000, 900, 1.1);
    const old = roughEta(obs(600), airport, 1000, 900, 1.1);
    if (fresh.kind !== 'estimate' || old.kind !== 'estimate') throw new Error('expected estimates');
    expect(fresh.seconds - old.seconds).toBe(600);
    expect(old.assumptions).toContain('position_age_deducted');
  });
  it('never goes negative', () => {
    const r = roughEta({ ...obs(0), lat: 44.9 }, airport, 1000, 900, 1.0);
    expect(r.kind === 'estimate' && r.seconds >= 0).toBe(true);
  });
});

describe('side-effect tools are opt-in in the tool loop', () => {
  const scripted = () => {
    let n = 0;
    const engine: LlmEngine = {
      async generate(_m: ChatMessage[], onToken: (s: string) => void) {
        const calls: EngineToolCall[] | undefined = n++ === 0 ? [{ name: 'open_airport_map', arguments: '{"destination":"toaleta"}' }] : undefined;
        onToken('ok');
        return { text: 'ok', toolCalls: calls, stats: { timeToFirstTokenMs: 1, tokensPerSecond: 1, totalMs: 1, tokens: 1 } };
      },
      async stop() {},
    };
    return engine;
  };
  const run = async (allow?: boolean) => {
    const opened: string[] = [];
    const deps = { now: () => new Date(), context: { connectionAvailable: false }, nav: { openAirportMap: (r: { destination: string }) => void opened.push(r.destination) } };
    const r = await runToolLoop(scripted(), [{ role: 'user', content: 'x' }], deps, () => {}, allow === undefined ? {} : { allowSideEffects: allow });
    return { opened, trace: r.trace };
  };
  it('blocked by default, allowed only when explicitly enabled', async () => {
    expect((await run()).opened).toEqual([]);
    expect((await run(false)).opened).toEqual([]);
    expect((await run(true)).opened).toEqual(['toaleta']);
    expect((await run()).trace[0]).toMatchObject({ ok: false, sideEffect: true });
  });
});

describe('argument schema ignores inherited property names', () => {
  it('"constructor" / "toString" are unknown arguments', () => {
    const schema = createTools().find((t) => t.name === 'get_gate')!.parameters;
    expect(validateArgs(schema, '{"constructor":"x"}').ok).toBe(false);
    expect(validateArgs(schema, '{"toString":"x"}').ok).toBe(false);
    expect(validateArgs(schema, '{"flightNumber":"DEMO123"}').ok).toBe(true);
  });
});

describe('provider estimates and delays reach the app (AirLabs)', () => {
  const NOW = Date.parse('2026-10-31T11:00:00Z') / 1000; // 12:00 at the departure airport
  const payload = {
    response: {
      hex: 'abc123', flight_iata: 'XX123', dep_iata: 'CRA', arr_iata: 'BGY',
      dep_time: '2026-10-31 12:45', dep_time_utc: '2026-10-31 10:45', dep_estimated: '2026-10-31 13:05', dep_estimated_utc: '2026-10-31 11:05',
      arr_time: '2026-10-31 14:10', arr_time_utc: '2026-10-31 13:10', arr_estimated: '2026-10-31 14:30', arr_estimated_utc: '2026-10-31 13:30',
      dep_delayed: 20, arr_delayed: 20, status: 'en-route', updated: NOW - 60,
    },
  };
  const rec = toFlightRecord(parseAirLabsFlight(payload), { nowSec: NOW })!;
  it('keeps the schedule untouched and carries estimates + delays in separate fields', () => {
    expect(rec.scheduledArrival).toBe('2026-10-31T14:10:00+01:00');
    expect(rec.estimatedArrival).toBe('2026-10-31T14:30:00+01:00');
    expect(rec.estimatedDeparture).toBe('2026-10-31T13:05:00+02:00');
    expect(rec.arrivalDelayMin).toBe(20);
  });
  it('the model sees them labelled as third-party', () => {
    const facts = flightFacts(rec, new Date('2026-10-31T11:30:00Z'));
    expect(facts).toContain('estimated arrival: 2026-10-31T14:30:00+01:00 (third-party estimate, may change)');
    expect(facts).toContain('arrival delay reported: 20 min (third-party)');
    expect(facts).toContain('scheduled arrival: 2026-10-31T14:10:00+01:00');
  });
  it('time remaining keeps the schedule basis and adds the provider estimate', () => {
    const r = timeRemaining(rec, new Date('2026-10-31T11:30:00Z')); // arr sched 13:10Z, est 13:30Z
    expect(r).toMatchObject({ status: 'available', basis: 'scheduled', duration: { minutes: 100 }, estimated: { minutes: 120 } });
  });
  it('deterministic answers mention the estimate only when it differs', () => {
    const ctx = { flight: rec, now: new Date('2026-10-31T11:30:00Z') };
    expect(flightAnswer('arrival', 'ro', ctx)).toContain('Estimarea furnizorului: 14:30');
    expect(flightAnswer('departure', 'en', ctx)).toContain("The provider's estimate: 13:05");
    expect(flightAnswer('remaining', 'ro', ctx)).toContain('Estimarea furnizorului: aproximativ 2h 0min');
    const same = { ...rec, estimatedArrival: rec.scheduledArrival };
    expect(flightAnswer('arrival', 'en', { ...ctx, flight: same })).not.toContain('provider');
    expect(flightAnswer('arrival', 'en', { flight: { ...rec, estimatedArrival: null, estimatedDeparture: null }, now: ctx.now })).not.toContain('provider');
  });
});

describe('OpenSkyClient details from the review', () => {
  const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s });
  const row = ['abc123', 'T', 'RO', 1000, 1000, 23, 44, 9000, false, 200, 0, 0, null, null, null, false, 0];
  it('accepts upper-case hex (same result as lower-case)', async () => {
    const client = new OpenSkyClient({ clientId: 'a', clientSecret: 'b' }, {
      fetchImpl: async (u) => (String(u).includes('openid-connect') ? json({ access_token: 't', expires_in: 1800 }) : json({ time: 1, states: [row] })),
    });
    const r = await client.getStateByIcao24('ABC123');
    expect(r.ok && r.observations).toHaveLength(1);
  });
  it('bad client credentials at the token endpoint -> auth_error, a token-endpoint outage -> provider_error', async () => {
    const make = (status: number) => new OpenSkyClient({ clientId: 'a', clientSecret: 'b' }, { fetchImpl: async () => json({}, status) });
    expect(await make(401).getStateByIcao24('abc123')).toEqual({ ok: false, reason: 'auth_error' });
    expect(await make(503).getStateByIcao24('abc123')).toEqual({ ok: false, reason: 'provider_error' });
  });
});
