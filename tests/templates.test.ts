import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';
import { flightAnswer, flightQuestionType, type FlightQuestionType } from '../src/core/templates';
import { FlightFlowAssistant, type LlmEngine } from '../src/core/assistant';
import { DEMO_FLIGHTS } from '../src/core/flight';
import type { FlightRecord } from '../src/core/types';

const demo = DEMO_FLIGHTS[0];
const mid = new Date('2026-10-31T12:00:00Z'); // between departure and arrival
const types: FlightQuestionType[] = ['gate', 'remaining', 'duration', 'arrival', 'departure', 'status'];

describe('flightQuestionType', () => {
  const cases: [string, FlightQuestionType][] = [
    ['Cand imi ajunge avionul ?', 'arrival'],
    ['La ce poarta e zborul meu?', 'gate'],
    ['Cât mai durează până aterizăm?', 'remaining'],
    ['How long until DEMO123 lands?', 'remaining'],
    ['Is my flight delayed?', 'status'],
    ['Care e durata zborului?', 'duration'],
    ['What gate is my flight?', 'gate'],
    ['What time does it land?', 'arrival'],
    ['Cand pleaca avionul?', 'departure'],
  ];
  it.each(cases)('%s -> %s', (q, t) => expect(flightQuestionType(q)).toBe(t));
  it.each(['când decolează și când ajunge?', 'Is the flight on time and what gate?', 'Cat bagaj pot lua?', 'Unde este toaleta?', 'hello'])('null for %s', (q) =>
    expect(flightQuestionType(q)).toBeNull(),
  );
  it('has no control characters in the source', () => {
    const src = readFileSync(new URL('../src/core/templates.ts', import.meta.url), 'utf8');
    expect(/[\u0000-\u0008\u000b-\u001f]/.test(src)).toBe(false);
  });
});

describe('flightAnswer', () => {
  for (const lang of ['ro', 'en'] as const) {
    it.each(types)(`${lang} %s uses the flight data`, (t) => {
      const a = flightAnswer(t, lang, { flight: demo, now: mid });
      expect(a).toBeTruthy();
      if (t === 'arrival') expect(a).toContain('14:10');
      if (t === 'departure') expect(a).toContain('12:45');
      if (t === 'duration') expect(a).toContain('2h 25min');
      if (t === 'remaining') expect(a).toContain('1h 10min');
    });
  }
  it('gate unknown never invents a gate, confirmed states it', () => {
    expect(flightAnswer('gate', 'en', { flight: demo, now: mid })).toMatch(/don't have a confirmed gate/);
    expect(flightAnswer('gate', 'ro', { flight: demo, now: mid })).toMatch(/Nu am o poartă confirmată/);
    const g: FlightRecord = { ...demo, gate: 'B7', gateStatus: 'confirmed', dataSource: 'airport_feed' };
    expect(flightAnswer('gate', 'en', { flight: g, now: mid })).toContain('B7');
    expect(flightAnswer('gate', 'ro', { flight: g, now: mid })).toContain('B7');
    expect(flightAnswer('gate', 'en', { flight: { ...g, gateStatus: 'unconfirmed' }, now: mid })).not.toContain('B7');
  });
  it('labels demo and airlabs data', () => {
    expect(flightAnswer('arrival', 'en', { flight: demo, now: mid })).toMatch(/demo \(fictional\)/);
    expect(flightAnswer('arrival', 'ro', { flight: demo, now: mid })).toMatch(/demo \(fictive\)/);
    const al: FlightRecord = { ...demo, dataSource: 'airlabs' };
    expect(flightAnswer('arrival', 'en', { flight: al, now: mid })).toMatch(/AirLabs \(not an official/);
    expect(flightAnswer('arrival', 'ro', { flight: al, now: mid })).toMatch(/AirLabs \(nu este/);
    expect(flightAnswer('arrival', 'en', { flight: al, now: mid })).not.toMatch(/demo/);
  });
  it('city labels', () => {
    const c = { flight: demo, now: mid, cities: { arr: 'Bergamo' } };
    expect(flightAnswer('arrival', 'ro', c)).toContain('14:10 (ora Bergamo)');
    expect(flightAnswer('arrival', 'en', c)).toContain('14:10 (Bergamo time)');
  });
  it('remaining before departure and after arrival', () => {
    const before = new Date('2026-10-31T07:00:00Z');
    expect(flightAnswer('remaining', 'en', { flight: demo, now: before })).toMatch(/scheduled departure time has not arrived/);
    expect(flightAnswer('remaining', 'en', { flight: demo, now: before, question: 'How long until we land?' })).toContain('6h 10min');
    expect(flightAnswer('remaining', 'ro', { flight: demo, now: new Date('2026-10-31T12:00:00Z'), question: 'Cât mai e până decolăm?' })).toContain('Ora decolării programate a trecut');
    expect(flightAnswer('remaining', 'ro', { flight: demo, now: new Date('2026-11-02T00:00:00Z') })).toMatch(/a trecut deja/);
  });
});

describe('assistant uses templates without the engine', () => {
  const stats = { timeToFirstTokenMs: 1, tokensPerSecond: 1, totalMs: 1, tokens: 1 };
  const make = () => {
    const seen: { role: string; content: string }[][] = [];
    const engine: LlmEngine = {
      async generate(messages, onToken) {
        seen.push(messages);
        onToken('model');
        return { text: 'model', stats };
      },
      async stop() {},
    };
    return { engine, seen };
  };
  const ctx = { connectionAvailable: false, flightNumber: 'DEMO123' };
  const opts = { now: () => mid };

  it('does not call the engine for an exact flight question and streams the answer', async () => {
    const m = make();
    const a = new FlightFlowAssistant(m.engine, opts);
    const tokens: string[] = [];
    const r = await a.ask('Cand imi ajunge avionul ?', ctx, (t) => tokens.push(t));
    expect(m.seen).toHaveLength(0);
    expect(r.source).toBe('template');
    expect(r.text).toContain('14:10');
    expect(tokens.join('')).toBe(r.text);
    expect(r.stats).toEqual({ timeToFirstTokenMs: null, tokensPerSecond: null, totalMs: 0, tokens: 0 });
  });
  it('keeps the requested landing target in a pre-departure countdown', async () => {
    const m = make();
    const a = new FlightFlowAssistant(m.engine, { now: () => new Date('2026-10-31T07:00:00Z') });
    const r = await a.ask('Cât mai e până aterizăm?', ctx, () => {});
    expect(r.source).toBe('template');
    expect(r.text).toContain('6h 10min');
    expect(m.seen).toHaveLength(0);
  });
  it('calls the engine for mixed, unrelated, navigation and flightless questions', async () => {
    const m = make();
    const a = new FlightFlowAssistant(m.engine, opts);
    for (const q of ['când decolează și când ajunge?', 'Cat bagaj pot lua?', 'Where is the toilet?']) {
      expect((await a.ask(q, ctx, () => {})).source).toBe('model');
    }
    expect(m.seen).toHaveLength(3);
    // No flight known: by default the assistant asks for it (see tests/pipeline.test.ts); with clarification off the model answers.
    const noFlight = { connectionAvailable: false };
    expect((await a.ask('Cand imi ajunge avionul ?', noFlight, () => {})).source).toBe('clarification');
    const b = new FlightFlowAssistant(m.engine, { ...opts, clarify: false });
    expect((await b.ask('Cand imi ajunge avionul ?', noFlight, () => {})).source).toBe('model');
  });
  it('can be disabled, and template turns stay in history', async () => {
    const off = make();
    const a0 = new FlightFlowAssistant(off.engine, { ...opts, deterministicFlightAnswers: false });
    expect((await a0.ask('Cand imi ajunge avionul ?', ctx, () => {})).source).toBe('model');
    expect(off.seen).toHaveLength(1);

    const m = make();
    const a = new FlightFlowAssistant(m.engine, opts);
    await a.ask('Is my flight delayed?', ctx, () => {});
    await a.ask('Cat bagaj pot lua?', ctx, () => {});
    expect(m.seen).toHaveLength(1);
    expect(m.seen[0].map((x) => x.content).join('\n')).toContain('Is my flight delayed?');
  });
});
