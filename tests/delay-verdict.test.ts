import { describe, expect, it } from 'vitest';
import { DEMO_FLIGHTS, delayVerdict, flightFacts } from '../src/core/flight';
import { createTools, executeToolCall } from '../src/tools/registry';
import type { FlightRecord } from '../src/core/types';

const base: FlightRecord = { ...DEMO_FLIGHTS[0], scheduledArrival: '2026-10-31T14:10:00+01:00' };
const withEst = (estimatedArrival: string | null, extra: Partial<FlightRecord> = {}): FlightRecord => ({ ...base, estimatedArrival, ...extra });

describe('delayVerdict (pure arithmetic on estimated vs scheduled)', () => {
  it('unknown without any estimate', () => {
    expect(delayVerdict(base)).toEqual({ verdict: 'unknown' });
  });
  it('the live KL462 case: estimate 16 min BEFORE schedule is early, never delayed', () => {
    const f = withEst('2026-10-31T13:54:00+01:00');
    expect(delayVerdict(f)).toEqual({ verdict: 'early', minutes: -16, basis: 'arrival' });
  });
  it('15 min or more is delayed; 14 is still on time', () => {
    expect(delayVerdict(withEst('2026-10-31T14:25:00+01:00'))).toMatchObject({ verdict: 'delayed', minutes: 15 });
    expect(delayVerdict(withEst('2026-10-31T14:24:00+01:00'))).toMatchObject({ verdict: 'on_time', minutes: 14 });
  });
  it('small early margin counts as on time', () => {
    expect(delayVerdict(withEst('2026-10-31T14:07:00+01:00'))).toMatchObject({ verdict: 'on_time', minutes: -3 });
  });
  it('compares instants, not wall-clock strings (different offsets)', () => {
    expect(delayVerdict(withEst('2026-10-31T13:40:00Z'))).toMatchObject({ verdict: 'delayed', minutes: 30 }); // 14:10+01 = 13:10Z
  });
  it('falls back to departure when there is no arrival estimate', () => {
    const f = withEst(null, { estimatedDeparture: '2026-10-31T13:15:00+02:00' }); // scheduled 12:45+02
    expect(delayVerdict(f)).toEqual({ verdict: 'delayed', minutes: 30, basis: 'departure' });
  });
  it('invalid timestamps are unknown', () => {
    expect(delayVerdict(withEst('not-a-date'))).toEqual({ verdict: 'unknown' });
  });
});

describe('delay verdict reaches the model through the facts and the tool result', () => {
  it('facts state the verdict in words', () => {
    expect(flightFacts(withEst('2026-10-31T13:54:00+01:00'), new Date('2026-10-31T12:00:00Z'))).toMatch(/delay verdict .*EARLIER than scheduled by 16 min/);
    expect(flightFacts(withEst('2026-10-31T14:40:00+01:00'), new Date('2026-10-31T12:00:00Z'))).toMatch(/DELAYED by 30 min/);
  });
  it('no verdict line without an estimate', () => {
    expect(flightFacts(base, new Date('2026-10-31T12:00:00Z'))).not.toMatch(/delay verdict/);
  });
  it('get_flight_details returns a structured delay_verdict', async () => {
    const r = await executeToolCall(createTools(), 'get_flight_details', {}, {
      now: () => new Date('2026-10-31T12:00:00Z'),
      context: { flightNumber: 'DEMO123', connectionAvailable: false },
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect((r.data as { delay_verdict: unknown }).delay_verdict).toEqual({ verdict: 'unknown' });
  });
});
