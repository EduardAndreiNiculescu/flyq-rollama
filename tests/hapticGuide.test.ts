import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HapticGuide, planPulse, type Haptics } from '../src/flyq/lib/hapticGuide';

describe('planPulse', () => {
  it('on course: one light tick every 2 s', () => {
    expect(planPulse(0)).toMatchObject({ kind: 'onCourse', taps: 1, strong: false, intervalMs: 2000 });
    expect(planPulse(-14)).toMatchObject({ kind: 'onCourse' });
  });
  it('the number of taps says the side: one for left, two for right', () => {
    expect(planPulse(-40)).toMatchObject({ kind: 'left', taps: 1 });
    expect(planPulse(40)).toMatchObject({ kind: 'right', taps: 2 });
  });
  it('the further off, the shorter the pause and the firmer the tap', () => {
    expect(planPulse(20).intervalMs).toBeGreaterThan(planPulse(100).intervalMs);
    expect(planPulse(30).strong).toBe(false);
    expect(planPulse(90).strong).toBe(true);
  });
  it('behind you: a rapid warning', () => {
    expect(planPulse(170)).toMatchObject({ kind: 'turnAround', intervalMs: 600 });
    expect(planPulse(-170)).toMatchObject({ kind: 'turnAround' });
  });
});

describe('HapticGuide', () => {
  let t = 0;
  const calls: string[] = [];
  const spoken: string[] = [];
  const haptics: Haptics = { tap: s => calls.push(s ? 'tap!' : 'tap'), success: () => calls.push('success'), warning: () => calls.push('warning') };
  const guide = () => new HapticGuide(haptics, s => spoken.push(s), () => t);
  beforeEach(() => {
    vi.useFakeTimers();
    t = 0;
    calls.length = 0;
    spoken.length = 0;
  });
  afterEach(() => vi.useRealTimers());

  it('fires at the pace of the pulse, not on every reading', () => {
    const g = guide();
    g.update(0, 50);
    t = 500;
    g.update(0, 49);
    t = 1900;
    g.update(0, 48);
    expect(calls).toEqual(['tap']);
    t = 2100;
    g.update(0, 47);
    expect(calls).toEqual(['tap', 'tap']);
  });
  it('a change of what to feel is signalled at once; right is two taps', () => {
    const g = guide();
    g.update(0, 50);
    t = 100;
    g.update(50, 50);
    vi.advanceTimersByTime(200);
    expect(calls).toEqual(['tap', 'tap', 'tap']); // on course, then the two taps for "right"
  });
  it('turn around uses the warning pattern', () => {
    const g = guide();
    g.update(180, 30);
    expect(calls).toEqual(['warning']);
  });
  it('speaks the distance once at 20, 10 and 5 m, and arrival with a success pattern', () => {
    const g = guide();
    for (const m of [30, 19, 18, 9, 8, 4]) {
      t += 3000;
      g.update(0, m);
    }
    expect(spoken).toEqual(['20 metri', '10 metri', '5 metri']);
    g.arrived();
    expect(calls[calls.length - 1]).toBe('success');
    expect(spoken[spoken.length - 1]).toBe('Ai ajuns');
  });
  it('stop cancels the taps still waiting', () => {
    const g = guide();
    g.update(50, 50); // right: the second tap is scheduled
    g.stop();
    vi.advanceTimersByTime(500);
    expect(calls).toEqual(['tap']);
  });
});
