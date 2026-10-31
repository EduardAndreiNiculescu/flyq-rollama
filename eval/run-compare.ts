/**
 * Compare two or more models on identical inputs (desktop evaluation, NOT on-device).
 *
 *   npx tsx eval/run-compare.ts --models base,adapter --base http://127.0.0.1:18081/v1 [--sets v2,qs51] [--limit 40] [--per-category 5]
 *
 * Sets: v2  = finetune/data/v2/test.jsonl (held-out scenarios, reference answers)
 *       qs51 = eval/questions.json (51 hand-written questions, built with the app's real pipeline)
 * Prints a side-by-side table, lists cases where models disagree, and saves raw outputs to eval/results/.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chat } from './lib/chat';
import { messagesForQuestion } from './lib/pipeline';
import { scoreRegex, scoreV2, summarize, unsupportedNumbers, type Row, type V2Case } from './lib/score';

type QS = { id: string; category: string; lang: 'ro' | 'en'; question: string; mustAny: string[]; mustNot: string[] };
type Detail = Row & { id: string; answer: string; reasons: string[] };
export type CompareOptions = { base: string; models: string[]; sets: string[]; limit?: number; perCategory?: number; log?: (s: string) => void; v2Path?: string; qsPath?: string };

const readJsonl = <T,>(p: string): T[] => readFileSync(p, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));

/** Keep the first n cases of each category (original order preserved). Same cases for every model. */
export function stratify<T extends { category: string }>(cases: T[], n?: number): T[] {
  if (!n || n <= 0) return cases;
  const seen: Record<string, number> = {};
  return cases.filter((c) => (seen[c.category] = (seen[c.category] ?? 0) + 1) <= n);
}

export async function runCompare(o: CompareOptions) {
  const log = o.log ?? (() => {});
  const out: Record<string, Record<string, Detail[]>> = {};
  for (const model of o.models) {
    out[model] = {};
    for (const set of o.sets) {
      const rows: Detail[] = [];
      if (set === 'v2') {
        const cases = stratify(readJsonl<V2Case>(o.v2Path ?? fileURLToPath(new URL('../finetune/data/v2/test.jsonl', import.meta.url))), o.perCategory).slice(0, o.limit ?? 1e9);
        for (const c of cases) {
          const r = await chat(o.base, model, c.messages.slice(0, -1) as never);
          const s = scoreV2(c, r.text);
          rows.push({ id: c.id, category: c.category, pass: s.pass, unsupported: s.unsupportedNumbers.length > 0, langOk: s.langOk, ms: r.ms, answer: r.text, reasons: s.reasons });
          log(`${model} v2 ${rows.length}/${cases.length}`);
        }
      } else if (set === 'qs51') {
        const qs: QS[] = JSON.parse(readFileSync(o.qsPath ?? fileURLToPath(new URL('./questions.json', import.meta.url)), 'utf8')).slice(0, o.limit ?? 1e9);
        for (const q of qs) {
          const msgs = messagesForQuestion(q.question);
          const r = await chat(o.base, model, msgs);
          const s = scoreRegex(q, r.text);
          const ctx = msgs.map((m) => m.content).join('\n');
          const nums = unsupportedNumbers(r.text, ctx);
          rows.push({ id: q.id, category: q.category, pass: s.correct && nums.length === 0, unsupported: s.unsupported || nums.length > 0, langOk: null, ms: r.ms, answer: r.text, reasons: [...(s.correct ? [] : ['regex check failed']), ...(nums.length ? [`numbers not in context: ${nums.join(', ')}`] : [])] });
          log(`${model} qs51 ${rows.length}/${qs.length}`);
        }
      } else throw new Error(`unknown set ${set}`);
      out[model][set] = rows;
    }
  }
  return out;
}

export function formatTable(out: Awaited<ReturnType<typeof runCompare>>, models: string[], sets: string[]): string {
  const pct = (a: number, b: number) => (b ? `${((100 * a) / b).toFixed(0)}%` : '-');
  const lines: string[] = [];
  for (const set of sets) {
    lines.push(`\n=== ${set} ===`, ['metric', ...models].join(' | '));
    const sums = models.map((m) => summarize(out[m][set]));
    lines.push(['passed', ...sums.map((s) => `${s.pass}/${s.n} (${pct(s.pass, s.n)})`)].join(' | '));
    lines.push(['answers with numbers not in context', ...sums.map((s) => `${(100 * s.unsupportedRate).toFixed(0)}%`)].join(' | '));
    lines.push(['answer language correct', ...sums.map((s) => (s.langRate === null ? '-' : `${(100 * s.langRate).toFixed(0)}%`))].join(' | '));
    lines.push(['median latency ms', ...sums.map((s) => String(s.medianMs ?? '-'))].join(' | '));
    const cats = [...new Set(sums.flatMap((s) => Object.keys(s.byCategory)))].sort();
    for (const c of cats) lines.push([`  ${c}`, ...sums.map((s) => (s.byCategory[c] ? `${s.byCategory[c].pass}/${s.byCategory[c].n}` : '-'))].join(' | '));
    if (models.length === 2) {
      const [a, b] = models;
      const diff = out[a][set].map((r, i) => ({ r, o: out[b][set][i] })).filter(({ r, o }) => r.pass !== o.pass);
      lines.push(`\n  ${diff.length} cases differ (${a} vs ${b}); first 8:`);
      for (const { r, o } of diff.slice(0, 8)) {
        lines.push(`  ${r.id} [${r.category}] ${a}=${r.pass ? 'PASS' : 'FAIL'} ${b}=${o.pass ? 'PASS' : 'FAIL'}`);
        lines.push(`      ${a}: ${r.answer.replace(/\s+/g, ' ').slice(0, 140)}${r.reasons.length ? `  [${r.reasons.join('; ')}]` : ''}`);
        lines.push(`      ${b}: ${o.answer.replace(/\s+/g, ' ').slice(0, 140)}${o.reasons.length ? `  [${o.reasons.join('; ')}]` : ''}`);
      }
    }
  }
  return lines.join('\n');
}

async function main() {
  const arg = (n: string, d: string) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : d; };
  const models = arg('models', 'base,adapter').split(',');
  const sets = arg('sets', 'v2,qs51').split(',');
  const out = await runCompare({ base: arg('base', 'http://127.0.0.1:18081/v1'), models, sets, limit: Number(arg('limit', '100000')), perCategory: Number(arg('per-category', '0')), log: (s) => process.stdout.write(`\r${s}   `) });
  console.log(formatTable(out, models, sets));
  mkdirSync(new URL('./results/', import.meta.url), { recursive: true });
  const file = new URL(`./results/compare-${new Date().toISOString().replace(/[:.]/g, '-')}.json`, import.meta.url);
  writeFileSync(file, JSON.stringify({ models, sets, out }, null, 1));
  console.log(`\nraw outputs saved: ${fileURLToPath(file)}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
