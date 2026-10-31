import { describe, expect, it } from 'vitest';
import { planKey, planReminders, REMINDER_PREFIX } from '../src/services/live/reminderPlan';

const base = { flightNumber: 'W6 69901', from: 'CRA', to: 'LTN', boardingUtc: '2026-11-01T06:00:00Z', gateCloseUtc: '2026-11-01T06:20:00Z', departureUtc: '2026-11-01T06:40:00Z', gate: '3', delayMin: 0, language: 'ro' as const, nowMs: Date.parse('2026-11-01T04:00:00Z') };

describe('local reminder plan', () => {
  it('plans boarding in 15 min, boarding started and gate closing in 10 min', () => {
    const r = planReminders(base);
    expect(r.map(x => x.id)).toEqual([REMINDER_PREFIX + 'before-boarding', REMINDER_PREFIX + 'boarding', REMINDER_PREFIX + 'gate-closing']);
    expect(new Date(r[0].atMs).toISOString()).toBe('2026-11-01T05:45:00.000Z');
    expect(new Date(r[1].atMs).toISOString()).toBe('2026-11-01T06:00:00.000Z');
    expect(new Date(r[2].atMs).toISOString()).toBe('2026-11-01T06:10:00.000Z');
    expect(r[1].body).toContain('poarta 3');
  });
  it('moves every reminder by the delay the server reported', () => {
    const r = planReminders({ ...base, delayMin: 25 });
    expect(new Date(r[1].atMs).toISOString()).toBe('2026-11-01T06:25:00.000Z');
  });
  it('drops reminders that are already in the past and says when the gate is unknown', () => {
    const r = planReminders({ ...base, gate: '—', nowMs: Date.parse('2026-11-01T05:50:00Z') });
    expect(r.map(x => x.id)).toEqual([REMINDER_PREFIX + 'boarding', REMINDER_PREFIX + 'gate-closing']);
    expect(r[0].body).toContain('panouri');
  });
  it('plans nothing for a flight more than 48 h away or with a broken time', () => {
    expect(planReminders({ ...base, nowMs: Date.parse('2026-10-25T00:00:00Z') })).toEqual([]);
    expect(planReminders({ ...base, boardingUtc: 'nope' })).toEqual([]);
  });
  it('has a stable key, so an unchanged plan is not rescheduled', () => {
    expect(planKey(planReminders(base))).toBe(planKey(planReminders({ ...base })));
    expect(planKey(planReminders(base))).not.toBe(planKey(planReminders({ ...base, gate: '7' })));
  });
});
