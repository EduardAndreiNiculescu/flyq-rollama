import { describe, expect, it } from 'vitest';
import { FlightFlowAssistant, type LlmEngine } from '../src/core/assistant';
import { DEMO_FLIGHTS } from '../src/core/flight';

/** Full ask() pipeline with a scripted engine: router -> spell -> clarify -> template -> retrieval -> model -> guard. */
function setup(answer: string, opts: ConstructorParameters<typeof FlightFlowAssistant>[1] = {}) {
  const calls: string[] = [];
  const engine: LlmEngine = {
    async generate(messages, onToken) {
      calls.push(messages[messages.length - 1].content);
      onToken(answer);
      return { text: answer, stats: { timeToFirstTokenMs: 5, tokensPerSecond: 9, totalMs: 20, tokens: 12 } };
    },
    async stop() {},
  };
  const opened: string[] = [];
  const a = new FlightFlowAssistant(engine, {
    now: () => new Date('2026-10-31T09:00:00Z'),
    nav: { openAirportMap: (r) => void opened.push(r.destination) },
    ...opts,
  });
  return { a, calls, opened };
}
const ctx = { flightNumber: 'DEMO123', connectionAvailable: false };
const streamed = () => {
  const seen: string[] = [];
  return { seen, onToken: (s: string) => void seen.push(s) };
};

describe('answer guard in the pipeline', () => {
  it('replaces an invented gate with the exact code answer for a flight question', async () => {
    const { a } = setup('Poarta ta este B12, mergi acolo acum.', { deterministicFlightAnswers: false });
    const s = streamed();
    const r = await a.ask('La ce poartă este zborul meu?', ctx, s.onToken);
    expect(r.source).toBe('guard_fallback');
    expect(r.text).toContain('Nu am o poartă confirmată pentru DEMO123');
    expect(r.text).not.toContain('B12');
    expect(r.guard?.original).toContain('B12');
    expect(r.guard?.violations.map((v) => v.kind)).toContain('gate');
    expect(s.seen[s.seen.length - 1]).toBe(r.text); // the screen ends on the safe text
  });
  it('replaces an invented time and does not keep it in the conversation history', async () => {
    const { a, calls } = setup('Sosirea este la 16:45.', { deterministicFlightAnswers: false });
    const r = await a.ask('Cât durează zborul și când ajunge?', ctx, () => {});
    expect(r.source).toBe('guard_fallback');
    expect(r.text).not.toContain('16:45');
    await a.ask('Mulțumesc', ctx, () => {});
    expect(calls).toHaveLength(2);
  });
  it('uses a generic honest message when no exact answer exists', async () => {
    const { a } = setup('Sunt avocat și îți garantez compensația.');
    const r = await a.ask('Mi-a dispărut bagajul, ce fac?', ctx, () => {});
    expect(r.source).toBe('guard_fallback');
    expect(r.text).toMatch(/Nu am|personal|aeroport/i);
  });
  it('lets a grounded answer through untouched', async () => {
    const good = 'Raportează la biroul de bagaje din zona de sosiri și cere o referință scrisă (PIR).';
    const { a } = setup(good);
    const r = await a.ask('Mi-a dispărut bagajul, ce fac?', ctx, () => {});
    expect(r.source).toBe('model');
    expect(r.text).toBe(good);
    expect(r.guard).toBeUndefined();
  });
  it('can be switched off', async () => {
    const { a } = setup('Poarta ta este B12.', { deterministicFlightAnswers: false, answerGuard: false });
    const r = await a.ask('La ce poartă este zborul meu?', ctx, () => {});
    expect(r.source).toBe('model');
    expect(r.text).toContain('B12');
  });
});

describe('clarification in the pipeline', () => {
  it('asks for the flight number instead of guessing, without calling the model', async () => {
    const { a, calls } = setup('should not be used', { flights: [] });
    const r = await a.ask('La ce oră decolează zborul meu?', { connectionAvailable: false }, () => {});
    expect(r.source).toBe('clarification');
    expect(r.missingInfo).toEqual(['no_flight']);
    expect(r.text.endsWith('?')).toBe(true);
    expect(calls).toHaveLength(0);
  });
  it('does not open the map or run any side effect when it asks', async () => {
    const { a, opened } = setup('x', { flights: [] });
    await a.ask('Cât mai durează până aterizăm?', { connectionAvailable: false }, () => {});
    expect(opened).toEqual([]);
  });
  it('does not ask when the flight is known, or for greetings and normal questions', async () => {
    const known = setup('ok', { deterministicFlightAnswers: false });
    expect((await known.a.ask('La ce oră decolează zborul meu?', ctx, () => {})).source).not.toBe('clarification');
    const hello = setup('Bună! Cu ce te pot ajuta?');
    const r = await hello.a.ask('Bună!', ctx, () => {});
    expect(r.source).toBe('model');
    expect(hello.calls).toHaveLength(1);
    const kb = setup('Raportează la biroul de bagaje.');
    expect((await kb.a.ask('Mi-a dispărut bagajul, ce fac?', ctx, () => {})).source).not.toBe('clarification');
  });
  it('can be switched off', async () => {
    const { a, calls } = setup('ok', { flights: [], clarify: false, deterministicFlightAnswers: false });
    const r = await a.ask('La ce oră decolează zborul meu?', { connectionAvailable: false }, () => {});
    expect(r.source).not.toBe('clarification');
    expect(calls).toHaveLength(1);
  });
});

describe('order of the pipeline stages', () => {
  it('exact flight question: answered by code, model untouched, guard not needed', async () => {
    const { a, calls } = setup('unused');
    const r = await a.ask('Cand imi ajunge avionul ?', ctx, () => {});
    expect(r.source).toBe('template');
    expect(r.text).toContain('14:10');
    expect(calls).toHaveLength(0);
  });
  it('typos are repaired for routing but the model still sees the original words', async () => {
    const { a, calls } = setup('Raportează la biroul de bagaje.');
    const r = await a.ask('Mi-a dispărut bagjaul, ce fac?', ctx, () => {});
    expect(r.corrections).toEqual([{ from: 'bagjaul', to: 'bagajul' }]);
    expect(calls[0]).toContain('bagjaul');
  });
  it('navigation still opens the map and the model is told', async () => {
    const { a, opened, calls } = setup('Am deschis harta către toaletă.');
    const r = await a.ask('Une este baia n aeroport', ctx, () => {});
    expect(opened).toEqual(['toaleta']);
    expect(r.source).toBe('model');
    expect(calls[0]).toContain('the map was requested for "toaleta"');
  });
  it('the demo flight list is the default data source', () => {
    expect(DEMO_FLIGHTS[0].flightNumber).toBe('DEMO123');
  });
});
