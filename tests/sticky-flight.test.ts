import { describe, expect, it } from 'vitest';
import { FlightFlowAssistant, type LlmEngine } from '../src/core/assistant';
import type { FlightRecord } from '../src/core/types';

const engine: LlmEngine = {
  generate: async () => ({ text: 'ok', stats: { timeToFirstTokenMs: null, tokensPerSecond: null, totalMs: 0, tokens: 0 } }),
  stop: async () => {},
} as unknown as LlmEngine;

const mk = (flightNumber: string, gate: string, arr: string): FlightRecord => ({
  flightNumber,
  departureAirport: 'CRA',
  arrivalAirport: 'BGY',
  scheduledDeparture: '2026-10-31T12:45:00+02:00',
  scheduledArrival: arr,
  gate,
  gateStatus: 'confirmed',
  dataSource: 'demo',
  lastUpdated: null,
});
const A = mk('AB101', 'A1', '2026-10-31T14:10:00+01:00');
const B = mk('CD202', 'B2', '2026-10-31T15:30:00+01:00');
const now = () => new Date('2026-10-31T08:00:00Z');
const ctx = { connectionAvailable: false } as const;

function assistant() {
  return new FlightFlowAssistant(engine, { flights: [A, B], now });
}

describe('sticky flight number across turns', () => {
  it('a gate follow-up without a number uses the flight named earlier', async () => {
    const a = assistant();
    const first = await a.ask('La ce poartă este CD202?', { ...ctx }, () => {});
    expect(first.text).toMatch(/B2/);
    const second = await a.ask('Și poarta?', { ...ctx }, () => {});
    expect(second.text).not.toMatch(/A1/);
    expect(second.text).toMatch(/B2/);
  });

  it('the mentioned flight beats the ticket default, and a newer mention replaces the sticky one', async () => {
    const a = assistant();
    const withTicket = { ...ctx, flightNumber: 'AB101' };
    expect((await a.ask('Which gate is CD202?', withTicket, () => {})).text).toMatch(/B2/);
    expect((await a.ask('and the gate?', withTicket, () => {})).text).toMatch(/B2/);
    expect((await a.ask('Which gate is AB101?', withTicket, () => {})).text).toMatch(/A1/);
    expect((await a.ask('and the gate?', withTicket, () => {})).text).toMatch(/A1/);
  });

  it('an unknown flight number never sticks', async () => {
    const a = assistant();
    await a.ask('Which gate is ZZ999?', { ...ctx, flightNumber: 'AB101' }, () => {});
    const r = await a.ask('and the gate?', { ...ctx, flightNumber: 'AB101' }, () => {});
    expect(r.text).toMatch(/A1/);
  });

  it('reset() forgets the sticky flight', async () => {
    const a = assistant();
    await a.ask('Which gate is CD202?', { ...ctx, flightNumber: 'AB101' }, () => {});
    a.reset();
    const r = await a.ask('and the gate?', { ...ctx, flightNumber: 'AB101' }, () => {});
    expect(r.text).toMatch(/A1/);
  });
});
