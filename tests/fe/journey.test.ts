import { describe, it, expect } from 'vitest';
import flightsJson from '../../src/data/flights.json';
import { DEMO_BCBP, parseBcbp } from '../../src/lib/bcbp';
import { buildSteps, remainingWalkMin, stepOpensAt, stepStates } from '../../src/lib/journey';
import type { Airport, Flight, Ticket } from '../../src/types';

const data = flightsJson as { airports: Airport[]; flights: Flight[] };
const flight = data.flights[0]!;
const CRA = data.airports.find(a => a.code === 'CRA')!;
const LTN = data.airports.find(a => a.code === 'LTN')!;
const parsed = parseBcbp(DEMO_BCBP);
if (!parsed.ok) throw new Error('demo invalid');

const ticket: Ticket = {
  id: 't1',
  pass: parsed.pass,
  flightId: flight.id,
  boardingGroup: 2,
  checkedInOnline: true,
  hasCheckedBag: false,
  isDemo: true,
  addedAt: '2026-10-31T06:00:00Z',
};

describe('buildSteps', () => {
  it('include controlul pașapoartelor pentru LTN (non-Schengen)', () => {
    const ids = buildSteps(ticket, flight, CRA, LTN).map(s => s.id);
    expect(ids).toEqual(['arrive', 'checkin', 'security', 'passport', 'gate', 'boarding']);
  });

  it('sare peste pașapoarte pentru un zbor Schengen', () => {
    const ids = buildSteps(ticket, flight, CRA, { ...LTN, schengen: true }).map(s => s.id);
    expect(ids).not.toContain('passport');
  });

  it('sare peste check-in când e făcut online și nu ai bagaj de cală', () => {
    const steps = buildSteps(ticket, flight, CRA, LTN);
    expect(steps.find(s => s.id === 'checkin')!.skipped).toBe(true);
    const withBag = buildSteps({ ...ticket, hasCheckedBag: true }, flight, CRA, LTN);
    expect(withBag.find(s => s.id === 'checkin')!.skipped).toBe(false);
  });

  it('ruta spre poartă folosește nodul porții din bilet', () => {
    const steps = buildSteps(ticket, flight, CRA, LTN);
    expect(steps.find(s => s.id === 'gate')!.targetNodeId).toBe('f1_gate3');
  });
});

describe('stepStates', () => {
  const steps = buildSteps(ticket, flight, CRA, LTN);

  it('primul pas neterminat devine curent', () => {
    expect(stepStates(steps, ['arrive'])).toEqual(['done', 'skipped', 'current', 'next', 'next', 'next']);
  });

  it('timpul de mers adună pașii rămași până la poartă', () => {
    const states = stepStates(steps, ['arrive']);
    expect(remainingWalkMin(steps, states)).toBe(10 + 8 + 4);
  });
});

describe('steps that are not open yet', () => {
  const steps = buildSteps(ticket, flight, CRA, LTN);
  const everything = ['arrive', 'checkin', 'security', 'passport', 'gate', 'boarding'];
  const dep = Date.parse(flight.departureUtc);
  const board = Date.parse(flight.boardingUtc);

  it('hours before boarding the gate and boarding steps are locked, even when they were ticked before', () => {
    const now = board - 3 * 3600_000;
    const opens = stepOpensAt(steps, flight, now);
    const states = stepStates(steps, everything, opens);
    expect(states[steps.findIndex(x => x.id === 'gate')]).toBe('next');
    expect(states[steps.findIndex(x => x.id === 'boarding')]).toBe('next');
    expect(states.every(x => x === 'done' || x === 'skipped')).toBe(false); // "you are at the gate" cannot appear yet
  });
  it('the gate opens 90 minutes before departure and boarding 5 minutes before its time', () => {
    const gateIdx = steps.findIndex(x => x.id === 'gate');
    const boardIdx = steps.findIndex(x => x.id === 'boarding');
    expect(stepOpensAt(steps, flight, dep - 91 * 60_000)[gateIdx]).not.toBeNull();
    expect(stepOpensAt(steps, flight, dep - 89 * 60_000)[gateIdx]).toBeNull();
    expect(stepOpensAt(steps, flight, board - 6 * 60_000)[boardIdx]).not.toBeNull();
    expect(stepOpensAt(steps, flight, board - 4 * 60_000)[boardIdx]).toBeNull();
  });
  it('when everything is open the ticked steps are done again', () => {
    const now = board;
    const states = stepStates(steps, everything, stepOpensAt(steps, flight, now));
    expect(states.every(x => x === 'done' || x === 'skipped')).toBe(true);
  });
});
