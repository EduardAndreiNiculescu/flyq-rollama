import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { FLIGHTS, scoreTurn, type Scenario } from '../eval/run-multi';
import { delayVerdict } from '../src/core/flight';
import { createTools } from '../src/tools/registry';
import type { ToolCase } from '../eval/run-tools';

const read = (f: string) => JSON.parse(readFileSync(fileURLToPath(new URL(`../eval/${f}`, import.meta.url)), 'utf8'));
const names = new Set(createTools().map((t) => t.name));

describe('held-out single-turn set (tool-cases-v4.json)', () => {
  const cases: ToolCase[] = read('tool-cases-v4.json');
  it('is well-formed, bilingual and references only real tools', () => {
    expect(new Set(cases.map((c) => c.id)).size).toBe(cases.length);
    for (const c of cases) for (const n of [...c.expectedAny, ...c.forbidden]) expect(names.has(n), `${c.id}: ${n}`).toBe(true);
    expect(cases.filter((c) => c.lang === 'ro').length).toBeGreaterThanOrEqual(25);
    expect(cases.filter((c) => c.lang === 'en').length).toBeGreaterThanOrEqual(25);
  });
  it('shares no question with the original set', () => {
    const old = new Set((read('tool-cases.json') as ToolCase[]).map((c) => c.question.toLowerCase()));
    expect(cases.filter((c) => old.has(c.question.toLowerCase()))).toEqual([]);
  });
});

describe('multi-turn scenarios (multi-cases.json)', () => {
  const scenarios: Scenario[] = read('multi-cases.json');
  it('has 3+ well-formed turns per conversation, real tools and valid regexes', () => {
    expect(scenarios.length).toBeGreaterThanOrEqual(10);
    for (const s of scenarios) for (const t of s.turns) {
      for (const n of [...(t.expectedAny ?? []), ...(t.forbidden ?? [])]) expect(names.has(n), `${s.id}: ${n}`).toBe(true);
      for (const r of [...(t.must ?? []), ...(t.mustNot ?? [])]) expect(() => new RegExp(r, 'i')).not.toThrow();
    }
  });
  it('fixture facts match what the checks assume', () => {
    const ro = FLIGHTS.find((f) => f.flightNumber === 'RO311')!;
    expect(delayVerdict(ro)).toMatchObject({ verdict: 'delayed', minutes: 35 });
    expect(ro.gate).toBe('B7');
    expect(FLIGHTS.find((f) => f.flightNumber === 'DEMO123')!.gate).toBeNull();
  });
});

describe('scoreTurn', () => {
  it('checks tools and answer text', () => {
    expect(scoreTurn({ user: 'x', expectedAny: ['get_gate'], must: ['B ?7'] }, ['get_gate'], 'Gate B7').pass).toBe(true);
    expect(scoreTurn({ user: 'x', expectedAny: ['get_gate'] }, [], 'Gate B7').pass).toBe(false);
    expect(scoreTurn({ user: 'x', expectedAny: [] }, ['get_gate'], '').reasons[0]).toContain('expected no tool');
    expect(scoreTurn({ user: 'x', mustNot: ['la timp'] }, [], 'este la timp').pass).toBe(false);
  });
});
