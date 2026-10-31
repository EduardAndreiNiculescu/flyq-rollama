// Offline KB retrieval eval: hit@1 / hit@3 / out-of-scope false-hit rate, dev vs test.
// Same pipeline as the app: correctQuestion (spell) -> detectLang -> retrieve(k=3).
// Run: npx tsx eval/retrieval-test.ts
import cases from './retrieval-cases.json';
import { KNOWLEDGE_BASE, normalize, retrieve, type Retrieved } from '../src/core/knowledge';
import { correctQuestion } from '../src/core/spell';
import { detectLang } from '../src/core/prompt';
import type { KbEntry } from '../src/core/types';

export type Case = { id: string; split: 'dev' | 'test'; q: string; expected: string[] };
export const CASES = cases as Case[];

/** ids differ only by the _ro/_en suffix, so labels are compared on the base id. */
export const baseId = (id: string): string => id.replace(/_(ro|en)$/, '').replace(/-(ro|en)$/, '');

type Retriever = (q: string, lang: 'en' | 'ro' | null, k: number, kb: KbEntry[]) => Retrieved[];

/**
 * FROZEN copy of the pre-expansion retrieve() (literal tokens only), kept so the
 * baseline stays reproducible after knowledge.ts changes.
 */
function tokenMatch(q: string, d: string): boolean {
  if (q === d) return true;
  const n = Math.min(q.length, d.length);
  return n >= 4 && (q.startsWith(d.slice(0, n)) || d.startsWith(q.slice(0, n))) && Math.abs(q.length - d.length) <= 4;
}
export const baselineRetrieve: Retriever = (query, lang, k, kb) => {
  const qt = normalize(query);
  if (qt.length === 0) return [];
  const scored = kb.map((entry) => {
    const kwTokens = entry.keywords.flatMap(normalize);
    const textTokens = normalize(entry.title + ' ' + entry.body);
    let score = 0;
    for (const q of qt) {
      if (kwTokens.some((t) => tokenMatch(q, t))) score += 3;
      else if (textTokens.some((t) => tokenMatch(q, t))) score += 1;
    }
    if (lang && entry.lang === lang) score *= 1.5;
    return { entry, score };
  });
  return scored.filter((s) => s.score >= 3).sort((a, b) => b.score - a.score).slice(0, k);
};

export type Metrics = { n: number; hit1: number; hit3: number; nOos: number; falseHit: number };

export function evaluate(split: 'dev' | 'test', retriever: Retriever = retrieve): Metrics {
  const m: Metrics = { n: 0, hit1: 0, hit3: 0, nOos: 0, falseHit: 0 };
  for (const c of CASES.filter((x) => x.split === split)) {
    const fixed = correctQuestion(c.q).text;
    const hits = retriever(fixed, detectLang(c.q), 3, KNOWLEDGE_BASE);
    if (c.expected.length === 0) {
      m.nOos++;
      if (hits.length > 0) m.falseHit++;
      continue;
    }
    m.n++;
    const ok = new Set(c.expected.map(baseId));
    const ids = hits.map((h) => baseId(h.entry.id));
    if (ids[0] && ok.has(ids[0])) m.hit1++;
    if (ids.some((i) => ok.has(i))) m.hit3++;
  }
  return m;
}

const pct = (a: number, b: number) => (b ? `${((100 * a) / b).toFixed(1)}%` : 'n/a');
const fmt = (m: Metrics) => `hit@1 ${m.hit1}/${m.n} (${pct(m.hit1, m.n)})  hit@3 ${m.hit3}/${m.n} (${pct(m.hit3, m.n)})  false-hit ${m.falseHit}/${m.nOos} (${pct(m.falseHit, m.nOos)})`;

if (process.argv[1]?.includes('retrieval-test')) {
  const verbose = process.argv.includes('--verbose');
  for (const split of ['dev', 'test'] as const) {
    console.log(`[${split}] baseline: ${fmt(evaluate(split, baselineRetrieve))}`);
    console.log(`[${split}] current : ${fmt(evaluate(split, retrieve))}`);
  }
  if (verbose) {
    for (const c of CASES) {
      const top = retrieve(correctQuestion(c.q).text, detectLang(c.q), 3).map((h) => baseId(h.entry.id));
      const ok = c.expected.length === 0 ? top.length === 0 : top.length > 0 && c.expected.map(baseId).includes(top[0]);
      if (!ok) console.log(`MISS [${c.split}] ${c.q} -> ${top.join(', ') || '(nothing)'} | want ${c.expected.map(baseId).join(', ') || '(nothing)'}`);
    }
  }
}
