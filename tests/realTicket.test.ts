import { describe, expect, it, vi } from 'vitest';
import { resolveRealTicket } from '../src/services/live/realTicket';
import { getLiveEntry } from '../src/services/live/liveFlights';
import type { FlightRecord } from '../src/core/types';
import type { BoardingPass } from '../src/types';

const NOW = new Date('2026-11-01T10:00:00Z');
// day of year of 2026-11-02 is 306
const pass = (over: Partial<BoardingPass> = {}): BoardingPass => ({
  raw: 'X', formatCode: 'M', legs: 1, passengerName: 'POPESCU/ANDREI', electronicTicket: true, pnr: 'EK7XQ2M', from: 'CRA', to: 'BGY', carrier: 'W4', flightNumber: '3773',
  julianDate: 306, compartment: 'Y', seat: '14C', sequence: '0042', passengerStatus: '1', ...over,
});
const record = (over: Partial<FlightRecord> = {}): FlightRecord => ({
  flightNumber: 'W43773', departureAirport: 'CRA', arrivalAirport: 'BGY', scheduledDeparture: '2026-11-02T14:25:00+02:00', scheduledArrival: '2026-11-02T14:55:00+01:00',
  gate: null, gateStatus: 'unconfirmed', dataSource: 'airlabs', lastUpdated: null, ...over,
});
const ok = (r: FlightRecord) => vi.fn(async () => ({ record: r, tracking: null }));

describe('a real ticket whose flight is not in the bundled schedule', () => {
  it('is looked up by flight number and day only, and registered as a live flight', async () => {
    const lookup = ok(record());
    const r = await resolveRealTicket(pass(), NOW, lookup);
    expect(r.ok).toBe(true);
    expect(lookup).toHaveBeenCalledTimes(1);
    expect(lookup).toHaveBeenCalledWith('W43773', '2026-11-02'); // nothing about the passenger is sent
    if (r.ok) expect(getLiveEntry(r.flightId)?.flight.from).toBe('CRA');
  });
  it('tries the other spellings when the server says not found', async () => {
    const lookup = vi.fn(async (n: string) => {
      if (n !== 'W43773') throw new Error('not_found');
      return { record: record(), tracking: null };
    });
    const r = await resolveRealTicket(pass({ carrier: 'W4', flightNumber: '3773' }), NOW, lookup as never);
    expect(r.ok).toBe(true);
  });
  it('refuses a ticket for another day than the flight found, saving nothing', async () => {
    const r = await resolveRealTicket(pass(), NOW, ok(record({ scheduledDeparture: '2026-11-03T14:25:00+02:00' })));
    expect(r).toEqual({ ok: false, error: 'wrongDay' });
  });
  it('reports not found, no network and provider errors with their own reason', async () => {
    const fail = (message: string) => vi.fn(async () => { throw new Error(message); });
    expect(await resolveRealTicket(pass(), NOW, fail('not_found') as never)).toEqual({ ok: false, error: 'flightNotFound' });
    expect(await resolveRealTicket(pass(), NOW, fail('unreachable') as never)).toEqual({ ok: false, error: 'noNetwork' });
    expect(await resolveRealTicket(pass(), NOW, fail('upstream') as never)).toEqual({ ok: false, error: 'upstream' });
    expect(await resolveRealTicket(pass(), NOW, fail('unauthorized') as never)).toEqual({ ok: false, error: 'unauthorized' });
  });
  it('a flight with an unknown airport is refused', async () => {
    const r = await resolveRealTicket(pass(), NOW, ok(record({ arrivalAirport: 'ZZZ' })));
    expect(r).toEqual({ ok: false, error: 'badFlight' });
  });
});
