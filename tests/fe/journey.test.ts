import { describe, it, expect } from 'vitest';
import flightsJson from '../../src/data/flights.json';
import { DEMO_BCBP, parseBcbp } from '../../src/lib/bcbp';
import { buildSteps, remainingWalkMin, stepStates } from '../../src/lib/journey';
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
