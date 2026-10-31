/**
 * Robustness to typos, measured WITHOUT any model:
 *   - router agreement: first intent of the noisy question == first intent of the clean one
 *   - retrieval agreement: top-1 knowledge-base document of the noisy question == the clean one's
 * each computed on the raw noisy text and on the spell-corrected text. Also counts false corrections
 * on clean text. Deterministic (seeded).   npx tsx eval/noise-test.ts [--variants 6] [--seed 7]
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { routeIntents } from '../src/core/router';
import { retrieve } from '../src/core/knowledge';
import { detectLang } from '../src/core/prompt';
import { correctQuestion } from '../src/core/spell';
import { injectTypos, makeRng } from './lib/noise';

export type NoiseReport = {
  questions: number;
  variants: number;
  router: { raw: number; corrected: number; total: number };
  retrieval: { raw: number; corrected: number; total: number };
  clean: { questions: number; changedQuestions: number; changes: string[] };
};

const top1 = (q: string) => retrieve(q, detectLang(q), 1)[0]?.entry.id ?? null;
const intent = (q: string) => routeIntents(q)[0].intent;

export function runNoise(questions: string[], variants = 6, seed = 7): NoiseReport {
  const rnd = makeRng(seed);
  const r: NoiseReport = { questions: questions.length, variants, router: { raw: 0, corrected: 0, total: 0 }, retrieval: { raw: 0, corrected: 0, total: 0 }, clean: { questions: questions.length, changedQuestions: 0, changes: [] } };
  for (const q of questions) {
    const cleanIntent = intent(q);
    const cleanTop = top1(q);
    const fix = correctQuestion(q);
    if (fix.changes.length) {
      r.clean.changedQuestions++;
      r.clean.changes.push(...fix.changes.map((c) => `${c.from}>${c.to}`));
    }
    for (let v = 0; v < variants; v++) {
      const noisy = injectTypos(q, rnd);
      if (noisy === q) continue;
      const fixed = correctQuestion(noisy).text;
      r.router.total++;
      if (intent(noisy) === cleanIntent) r.router.raw++;
      if (intent(fixed) === cleanIntent) r.router.corrected++;
      if (cleanTop) {
        r.retrieval.total++;
        if (top1(noisy) === cleanTop) r.retrieval.raw++;
        if (top1(fixed) === cleanTop) r.retrieval.corrected++;
      }
    }
  }
  return r;
}

export function loadQuestions(): string[] {
  const read = (p: string) => JSON.parse(readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8')) as { question: string }[];
  return [...read('./questions.json'), ...read('./tool-cases.json')].map((x) => x.question);
}

export const fmt = (a: number, b: number) => `${a}/${b} (${b ? ((100 * a) / b).toFixed(1) : '-'}%)`;

if (process.argv[1] && import.meta.url === new URL(`file:///${process.argv[1].replace(/\\/g, '/')}`).href) {
  const arg = (n: string, d: number) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? Number(process.argv[i + 1]) : d; };
  const qs = loadQuestions();
  const r = runNoise(qs, arg('variants', 6), arg('seed', 7));
  console.log(`${r.questions} clean questions x up to ${r.variants} noisy variants each\n`);
  console.log(`router agreement with clean text   raw: ${fmt(r.router.raw, r.router.total)}   corrected: ${fmt(r.router.corrected, r.router.total)}`);
  console.log(`retrieval top-1 agreement          raw: ${fmt(r.retrieval.raw, r.retrieval.total)}   corrected: ${fmt(r.retrieval.corrected, r.retrieval.total)}`);
  console.log(`\nfalse corrections on CLEAN text: ${r.clean.changedQuestions}/${r.clean.questions} questions changed`);
  if (r.clean.changes.length) console.log('  ', r.clean.changes.join('  '));
}
