import { describe, expect, it } from 'vitest';
import { BASE, generateBench, toolOk } from '../../src/bench/questions';

describe('benchmark questions', () => {
  it('has 100+ base questions across the categories we care about', () => {
    expect(BASE.length).toBeGreaterThanOrEqual(100);
    const cats = new Set(BASE.map(b => b.cat));
    for (const c of ['arrival', 'departure', 'delay', 'gate', 'remaining', 'tracking', 'rules', 'map', 'chat', 'offtopic', 'injection', 'boundary']) expect(cats.has(c), c).toBe(true);
  });
  it('same seed = same benchmark; another seed = different questions', () => {
    const a = generateBench(100, 7);
    expect(generateBench(100, 7).map(x => x.q)).toEqual(a.map(x => x.q));
    const other = generateBench(100, 8).map(x => x.q);
    const same = a.filter(x => other.includes(x.q)).length;
    expect(same).toBeLessThan(40);
  });
  it('100 unique questions, never empty, with human-style noise', () => {
    const qs = generateBench(100, 3);
    expect(qs).toHaveLength(100);
    expect(new Set(qs.map(x => x.q)).size).toBe(100);
    expect(qs.every(x => x.q.length > 0)).toBe(true);
    expect(qs.filter(x => x.q !== x.base).length).toBeGreaterThan(60);
    expect(qs.some(x => /\b(bă|mă|coaie|frate|băi)\b/i.test(x.q))).toBe(true);
    expect(qs.some(x => x.q === x.q.toUpperCase() && /[A-Z]/.test(x.q))).toBe(true);
  });
  it('toolOk: no tool expected means none called; alternatives are accepted; "*" is not scored', () => {
    expect(toolOk([], [])).toBe(true);
    expect(toolOk([], ['get_gate'])).toBe(false);
    expect(toolOk(['get_gate', 'get_flight_details'], ['get_flight_details'])).toBe(true);
    expect(toolOk(['get_gate'], ['search_knowledge', 'get_gate'])).toBe(false);
    expect(toolOk(['search_knowledge'], [])).toBe(false);
    expect(toolOk(['*'], ['x'])).toBeNull();
  });
});
