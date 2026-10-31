import { describe, expect, it } from 'vitest';
import type { ChatMessage, LlmEngine } from '../src/core/assistant';
import type { FlightRecord } from '../src/core/types';
import { guardToolAnswer } from '../src/tools/guardAnswer';
import { runToolLoop } from '../src/tools/loop';
import { createTools, type ToolDeps } from '../src/tools/registry';

const record: FlightRecord = {
  flightNumber: 'KL1375', departureAirport: 'AMS', arrivalAirport: 'OTP',
  scheduledDeparture: '2026-10-29T13:20:00+01:00', scheduledArrival: '2026-10-29T17:00:00+02:00',
  estimatedDeparture: '2026-10-29T13:20:00+01:00', estimatedArrival: '2026-10-29T17:17:00+02:00',
  gate: 'D71', gateStatus: 'confirmed', dataSource: 'airlabs', lastUpdated: '2026-10-29T12:01:00Z',
};
const deps: ToolDeps = { now: () => new Date('2026-10-29T12:30:00Z'), context: { flightNumber: 'KL1375', connectionAvailable: true }, flights: [record] };

/** The model asks for one tool, then answers with `answer`; returns what the guard makes of it. */
async function run(question: string, tool: string, answer: string) {
  const script = [{ text: '', toolCalls: [{ name: tool, arguments: '{}' }] }, { text: answer }];
  let n = 0;
  const engine: LlmEngine = {
    async generate() {
      const r = script[n++] ?? { text: answer };
      return { text: r.text, toolCalls: (r as { toolCalls?: { name: string; arguments: string }[] }).toolCalls, stats: { timeToFirstTokenMs: 1, tokensPerSecond: 1, totalMs: 1, tokens: 1 } };
    },
    async stop() {},
  };
  const msgs: ChatMessage[] = [{ role: 'system', content: 'You are FlightFlow, an offline travel assistant.' }, { role: 'user', content: question }];
  const out = await runToolLoop(engine, msgs, deps, () => {}, { tools: createTools(), maxSteps: 3, compose: false });
  return guardToolAnswer(out.messages, out.text, question, ['KL1375']);
}

describe('answer guard on the tool path', () => {
  it('keeps the verified EU emergency number even when no tool was called', () => {
    const messages: ChatMessage[] = [
      { role: 'system', content: 'You are FlightFlow. In an emergency, tell the passenger to dial 112 or find airport staff.' },
      { role: 'user', content: 'I need an ambulance now.' },
    ];
    expect(guardToolAnswer(messages, 'Call 112 now and ask airport staff for help.', 'I need an ambulance now.').violations).toEqual([]);
    expect(guardToolAnswer(messages, 'Call 113 now.', 'I need an ambulance now.').violations.map(v => v.kind)).toContain('number');
    expect(guardToolAnswer(messages, 'Call 112 now.', 'Where is my gate?').violations.map(v => v.kind)).toContain('number');
    expect(guardToolAnswer(messages.slice(1), 'Call 112 now.', 'I need an ambulance now.').violations.map(v => v.kind)).toContain('number');
  });
  it('does not trust a gate or time remembered from the prompt, passenger, or prior turns', () => {
    const messages: ChatMessage[] = [
      { role: 'system', content: 'You are FlightFlow. Example gate: B12.' },
      { role: 'tool', content: JSON.stringify({ result: { gate: 'B12', scheduledArrival: '2026-10-29T18:45:00+02:00' } }) },
      { role: 'assistant', content: 'Earlier, the gate was B12 and arrival was 18:45.' },
      { role: 'user', content: 'Is it still B12 at 18:45?' },
      { role: 'tool', content: JSON.stringify({ result: { flightNumber: 'KL1375', gate: null, status: 'unconfirmed', scheduledArrival: '2026-10-29T17:00:00+02:00' } }) },
    ];
    const r = guardToolAnswer(messages, 'Poarta pentru KL1375 este B12. Sosirea este la 18:45.', 'Ce poartă și oră am?', ['KL1375']);
    expect(r.violations.map(v => v.kind)).toContain('gate');
    expect(r.violations.map(v => v.kind)).toContain('number');
    expect(r.text).not.toContain('B12');
  });
  it('replaces an answer that names a flight the tools never mentioned (the RO1845 bug)', async () => {
    const r = await run('La ce poarta sunt?', 'get_gate', 'Poarta confirmată pentru RO1549 este D71. Verifică ecranele din aeroport.');
    expect(r.violations.length).toBeGreaterThan(0);
    expect(r.text).not.toContain('RO1549');
  });
  it('keeps a correct gate answer', async () => {
    const r = await run('La ce poarta sunt?', 'get_gate', 'Poarta confirmată pentru KL1375 este D71. Poarta se poate schimba, deci verifică ecranele din aeroport.');
    expect(r.violations).toEqual([]);
  });
  it('keeps a correct times/delay answer built from the tool result', async () => {
    const r = await run('Când aterizez?', 'get_flight_details', 'Sosirea programată pentru KL1375 este la 17:00. Estimarea furnizorului este 17:17, adică o întârziere de aproximativ 17 min. Este o estimare terță.');
    expect(r.violations).toEqual([]);
  });
  it('replaces an invented time and an invented gate', async () => {
    expect((await run('Când aterizez?', 'get_flight_details', 'Aterizăm la 19:45.')).violations.length).toBeGreaterThan(0);
    expect((await run('Ce poartă am?', 'get_gate', 'Poarta este B12.')).violations.length).toBeGreaterThan(0);
  });
});
