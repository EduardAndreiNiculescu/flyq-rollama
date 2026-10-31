import { describe, expect, it } from 'vitest';
import { CASES, baselineRetrieve, baseId, evaluate } from '../eval/retrieval-test';
import { expandQuery, KNOWLEDGE_BASE, normalize, retrieve, SYNONYM_GROUPS } from '../src/core/knowledge';

const groupsOf = (q: string) => expandQuery(q).map((g) => SYNONYM_GROUPS[g.group]);
const ids = (q: string, lang: 'ro' | 'en') => retrieve(q, lang, 3).map((h) => baseId(h.entry.id));

describe('retrieval eval cases', () => {
  it('are big enough and split into dev/test', () => {
    const inScope = CASES.filter((c) => c.expected.length > 0);
    expect(inScope.length).toBeGreaterThanOrEqual(70);
    expect(CASES.filter((c) => c.expected.length === 0).length).toBeGreaterThanOrEqual(15);
    for (const s of ['dev', 'test'] as const) expect(CASES.filter((c) => c.split === s).length).toBeGreaterThan(30);
  });
  it('only reference ids that exist in the KB', () => {
    const known = new Set(KNOWLEDGE_BASE.map((e) => baseId(e.id)));
    for (const c of CASES) for (const e of c.expected) expect(known.has(baseId(e)), `${c.id}: ${e}`).toBe(true);
  });
});

describe('synonym expansion improves retrieval on the held-out TEST split', () => {
  const base = evaluate('test', baselineRetrieve);
  const now = evaluate('test');
  it('hit@1 and hit@3 beat the literal-only baseline clearly', () => {
    expect(now.hit1).toBeGreaterThanOrEqual(base.hit1 + 5);
    expect(now.hit3).toBeGreaterThanOrEqual(base.hit3 + 3);
  });
  it('out-of-scope false-hit rate is not worse than baseline (test and dev)', () => {
    expect(now.falseHit).toBeLessThanOrEqual(base.falseHit);
    expect(evaluate('dev').falseHit).toBeLessThanOrEqual(evaluate('dev', baselineRetrieve).falseHit);
  });
});

describe('query expansion', () => {
  it('maps paraphrases to their group', () => {
    expect(groupsOf('geamantan').some((g) => g.includes('luggage'))).toBe(true);
    expect(groupsOf('briceag').some((g) => g.includes('knife'))).toBe(true);
    expect(groupsOf('wheelchair').some((g) => g.includes('scaun rulant'))).toBe(true);
  });
  it('matches multi-word phrases', () => {
    expect(groupsOf('vreau banii înapoi').some((g) => g.includes('refund'))).toBe(true);
    expect(groupsOf('I want my money back').some((g) => g.includes('refund'))).toBe(true);
  });
  it('flags trigger words unknown to the KB as out-of-vocabulary', () => {
    expect(expandQuery('geamantan', ['bagaj'])[0].oov).toBe(true);
    expect(expandQuery('bagaj', ['bagaj'])[0].oov).toBe(false);
  });
  it('does not expand unrelated text', () => {
    expect(expandQuery('best pizza recipe')).toHaveLength(0);
  });
  it('retrieves via synonyms the KB never mentions', () => {
    expect(ids('geamantanul meu nu a ajuns', 'ro')[0]).toMatch(/^(baggage-lost|ff_eu_baggage_complaint)$/);
    expect(ids('pot lua briceag la bord', 'ro')).toContain('ff_eu_sharp_objects');
    expect(ids('my puppy is travelling with me', 'en')).toContain('ff_eu_pets');
  });
  it('keeps literal matches ranked first and out-of-scope empty', () => {
    expect(ids('mi-a dispărut bagajul, ce fac?', 'ro')[0]).toBe('baggage-lost');
    expect(retrieve('best pizza recipe', 'en')).toHaveLength(0);
    expect(retrieve('rețetă de sarmale', 'ro')).toHaveLength(0);
  });
  it('treats Romanian "cât" as a question word, not the animal "cat"', () => {
    expect(retrieve('cât costă un iPhone nou', 'ro')).toHaveLength(0);
    expect(ids('can I bring my cat', 'en')).toContain('ff_eu_pets');
  });
  it('normalize is unchanged for plain text', () => {
    expect(normalize('Bagajul meu!')).toEqual(['bagajul', 'meu']);
  });
});
