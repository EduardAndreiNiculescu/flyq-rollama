import { describe, expect, it } from 'vitest';
import { DEMO_FLIGHTS } from '../src/core/flight';
import { nextSuggestions, stageOf, SUGGESTIONS, suggestionIdsFor, type Stage } from '../src/lib/suggestions';
import { RollamaEngine, type RawCompleter } from '../src/llm/rollamaEngine';
import { runToolLoop } from '../src/tools/loop';
import { createTools } from '../src/tools/registry';

const mk = (json: string): RawCompleter => ({ stop: async () => {}, completeRaw: async () => ({ text: json, stats: { timeToFirstTokenMs: 1, tokensPerSecond: 1, totalMs: 1, tokens: 1 } }) });
const ask = (q: string, model: string) =>
  runToolLoop(new RollamaEngine(mk(model)), [{ role: 'system', content: '' }, { role: 'user', content: q }], { now: () => new Date('2026-11-01T09:00:00+02:00'), context: { flightNumber: 'DEMO123', seat: '12A', boarding: '08:35' } as never, flights: DEMO_FLIGHTS }, () => {}, { tools: createTools(), maxSteps: 3, fastPath: true, intentRouting: true, allowSideEffects: true });
const BAD = /formulare sigură|safe wording|Nu am găsit un răspuns sigur|nu am găsit|couldn.t find/i;

describe('every guided question gets a real answer through the phone pipeline', () => {
  // two models seen on the phone: one that says "none" and one that always picks the flight details
  for (const [name, model] of [['none', '{"name":"none","arguments":{}}'], ['details', '{"name":"get_flight_details","arguments":{}}']] as const) {
    for (const s of SUGGESTIONS) {
      for (const lang of ['ro', 'en'] as const) {
        it(`[${name}/${lang}] ${s[lang]}`, async () => {
          const r = await ask(s[lang], model);
          expect(r.text.length).toBeGreaterThan(15);
          expect(r.text).not.toMatch(BAD);
        });
      }
    }
  }
});

describe('the chips', () => {
  const stages: Stage[] = ['early', 'pre', 'boarding'];
  it('stage from the journey', () => {
    expect(stageOf(false, 300, null)).toBe('early');
    expect(stageOf(false, 60, null)).toBe('pre');
    expect(stageOf(false, 10, null)).toBe('boarding');
    expect(stageOf(true, 0, 0.05)).toBe('climb');
    expect(stageOf(true, 0, 0.5)).toBe('cruise');
    expect(stageOf(true, 0, 0.9)).toBe('descent');
  });
  it('a question that was asked leaves and another takes its place; the list is never empty', () => {
    const asked = new Set<string>();
    const first = nextSuggestions(false, 'early', 'ro', asked);
    expect(first).toHaveLength(4);
    asked.add(first[0]!.id);
    const second = nextSuggestions(false, 'early', 'ro', asked);
    expect(second.map(x => x.id)).not.toContain(first[0]!.id);
    expect(second).toHaveLength(4);
    for (const s of SUGGESTIONS) asked.add(s.id);
    expect(nextSuggestions(false, 'early', 'ro', asked).length).toBeGreaterThan(0); // everything asked: starts over
  });
  it('the chips follow the stage and the phase', () => {
    const air = nextSuggestions(true, 'cruise', 'ro', new Set());
    expect(air.map(x => x.text)).toContain('Când aterizăm?');
    expect(nextSuggestions(true, 'descent', 'ro', new Set()).map(x => x.text)).toContain('Mi-a pierdut bagajul, ce fac?');
    expect(nextSuggestions(false, 'early', 'ro', new Set()).map(x => x.text)).not.toContain('Când aterizăm?');
    for (const st of stages) expect(nextSuggestions(false, st, 'en', new Set()).length).toBe(4);
  });
  it('shows no text twice and matches a typed question to the suggestion in either language', () => {
    const texts = nextSuggestions(true, 'cruise', 'ro', new Set(), 20).map(x => x.text);
    expect(new Set(texts).size).toBe(texts.length);
    expect(suggestionIdsFor('cand aterizam')).toEqual(['landing']); // diacritics and punctuation do not matter
    expect(suggestionIdsFor('Când aterizăm?')).toEqual(['landing']);
    expect(suggestionIdsFor('When do we land?')).toEqual(['landing']);
  });
});
