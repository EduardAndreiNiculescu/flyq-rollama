import { describe, expect, it } from 'vitest';
import { angleDiff, DeadReckoner, HeadingFilter, StepDetector, STEP_LENGTH_M } from '../src/flyq/lib/pdr';

describe('angleDiff', () => {
  it('is the shortest signed way round', () => {
    expect(angleDiff(10, 350)).toBe(20);
    expect(angleDiff(350, 10)).toBe(-20);
    expect(Math.abs(angleDiff(180, 0))).toBe(180);
  });
});

describe('StepDetector', () => {
  // a walking-like signal: gravity with a bump every ~550 ms
  const walk = (seconds: number, bump: number) => {
    const d = new StepDetector();
    let steps = 0;
    for (let ms = 0; ms < seconds * 1000; ms += 20) {
      const phase = (ms % 550) / 550;
      const lift = phase < 0.15 ? bump * Math.sin((phase / 0.15) * Math.PI) : 0;
      if (d.push(0, 0, 9.81 + lift, ms)) steps++;
    }
    return steps;
  };
  it('counts about one step per bump', () => {
    const steps = walk(11, 3);
    expect(steps).toBeGreaterThanOrEqual(15);
    expect(steps).toBeLessThanOrEqual(21);
  });
  it('counts nothing for a phone lying still or only slightly shaken', () => {
    expect(walk(10, 0)).toBe(0);
    expect(walk(10, 0.4)).toBe(0);
  });
});

describe('HeadingFilter', () => {
  it('starts at the first reading and smooths the rest, across north', () => {
    const f = new HeadingFilter(0.5);
    expect(f.update(350)).toBe(350);
    expect(f.update(10)).toBeCloseTo(0, 5); // 350 + 0.5 * 20 = 360 = 0
    expect(f.update(10)).toBeCloseTo(5, 5);
  });
});

describe('DeadReckoner', () => {
  it('walks north (-z), east (+x), south and west', () => {
    const r = new DeadReckoner(0, 0);
    const n = r.step(0);
    expect(n.z).toBeCloseTo(-STEP_LENGTH_M, 5);
    expect(n.x).toBeCloseTo(0, 5);
    const e = r.step(90);
    expect(e.x).toBeCloseTo(STEP_LENGTH_M, 5);
    r.step(180);
    expect(r.z).toBeCloseTo(0, 5);
    r.step(270);
    expect(r.x).toBeCloseTo(0, 5);
  });
  it("the map's north offset turns the compass into a map heading", () => {
    const r = new DeadReckoner(0, 0, 30);
    expect(r.mapHeading(30)).toBeCloseTo(0, 5);
    expect(r.mapHeading(10)).toBeCloseTo(340, 5);
    expect(r.step(30).headingDeg).toBeCloseTo(0, 5);
  });
});
