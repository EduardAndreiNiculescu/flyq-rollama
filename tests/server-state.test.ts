import { describe, expect, it } from 'vitest';
import { gateNodeId } from '../src/lib/gateNode';
import { applyServerState, type ServerState } from '../src/lib/serverState';
import type { Flight } from '../src/types';

const base: Flight = { id: 'f', carrier: 'W6', carrierName: 'Wizz', flightNumber: '9901', from: 'CRA', to: 'LTN', departureUtc: '2026-11-01T01:50:00.000Z', arrivalUtc: '2026-11-01T04:15:00.000Z', boardingUtc: '2026-11-01T01:10:00.000Z', gateCloseUtc: '2026-11-01T01:30:00.000Z', gate: '3', gateFloor: 1, aircraft: 'A321', cruiseAltitudeM: 11000, cruiseSpeedKmh: 830 };
const state = (o: Partial<ServerState> = {}): ServerState => ({ gate: null, gateStatus: 'unconfirmed', estimatedDeparture: null, estimatedArrival: null, departureDelayMin: null, arrivalDelayMin: null, status: null, belt: null, ...o });

describe('the flight the screens show follows the server', () => {
  it('is the schedule untouched when the server says nothing', () => {
    expect(applyServerState(base, undefined, undefined)).toBe(base);
  });
  it('moves departure, boarding, gate closing and arrival by the delay and keeps the schedule', () => {
    const f = applyServerState(base, state({ departureDelayMin: 25 }), undefined);
    expect(f.departureUtc).toBe('2026-11-01T02:15:00.000Z');
    expect(f.boardingUtc).toBe('2026-11-01T01:35:00.000Z');
    expect(f.gateCloseUtc).toBe('2026-11-01T01:55:00.000Z');
    expect(f.arrivalUtc).toBe('2026-11-01T04:40:00.000Z');
    expect(f.scheduledDepartureUtc).toBe(base.departureUtc);
    expect(f.delayMin).toBe(25);
  });
  it('uses the provider estimate when there is one, and the server ETA over everything for the arrival', () => {
    const f = applyServerState(base, state({ estimatedDeparture: '2026-11-01T03:50:00+02:00', estimatedArrival: '2026-11-01T04:30:00Z' }), undefined);
    expect(f.departureUtc).toBe('2026-11-01T01:50:00.000Z'); // 03:50 +02:00 is the same instant as the schedule: no delay
    const g = applyServerState(base, state({ estimatedArrival: '2026-11-01T04:30:00Z' }), { arrivalEpoch: Date.parse('2026-11-01T04:41:00Z') / 1000, source: 'server' });
    expect(g.arrivalUtc).toBe('2026-11-01T04:41:00.000Z');
  });
  it('takes the gate only when the server confirmed it', () => {
    expect(applyServerState(base, state({ gate: '7', gateStatus: 'unconfirmed' }), undefined).gate).toBe('3');
    expect(applyServerState(base, state({ gate: '7', gateStatus: 'confirmed' }), undefined).gate).toBe('7');
  });
  it('carries the status and the baggage belt', () => {
    const f = applyServerState(base, state({ status: 'landed', belt: '2' }), undefined);
    expect(f.status).toBe('landed');
    expect(f.baggageBelt).toBe('2');
  });
});

describe('gate node on the indoor map', () => {
  it('uses the gate when the map has it and the nearest one when it does not', () => {
    expect(gateNodeId('3')).toBe('f1_gate3');
    expect(gateNodeId('7')).toBe('f1_gate4');
    expect(gateNodeId(null)).toBe('f1_gate1');
    expect(gateNodeId('B2')).toBe('f1_gate2');
  });
});
