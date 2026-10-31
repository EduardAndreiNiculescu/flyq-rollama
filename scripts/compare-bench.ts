/**
 * Paired comparison of two benchmark runs on the SAME questions (A = baseline, B = candidate), each given as a list of result files:
 *   npx tsx scripts/compare-bench.ts --a eval/results/v3-seed31*.json --b eval/results/v4-seed31*.json
 * Questions are matched by their exact text; only questions scored in both runs count. Reports tool-choice accuracy with Wilson 95% intervals,
 * the discordant pairs, an exact two-sided McNemar test (binomial on the discordant pairs), and the per-category split.
 */
import { readFileSync } from 'node:fs';

type Item = { q: string; cat: string; toolOk: boolean | null; answer?: string };
const args = process.argv.slice(2);
const listAfter = (flag: string) => { const i = args.indexOf(flag); if (i < 0) return []; const out: string[] = []; for (let k = i + 1; k < args.length && !args[k].startsWith('--'); k++) out.push(args[k]); return out; };
const load = (files: string[]): Item[] => files.flatMap(f => (JSON.parse(readFileSync(f, 'utf8')).items ?? []) as Item[]);

function wilson(k: number, n: number, z = 1.96): [number, number] {
  if (!n) return [0, 0];
  const p = k / n, d = 1 + (z * z) / n;
  const c = (p + (z * z) / (2 * n)) / d, h = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return [Math.max(0, c - h), Math.min(1, c + h)];
}
function binomTwoSided(k: number, n: number): number {
  if (!n) return 1;
  let logC = 0; // exact tail with p = 0.5, computed in log space
  const lf = (m: number) => { let s = 0; for (let i = 2; i <= m; i++) s += Math.log(i); return s; };
  const pmf = (i: number) => Math.exp(lf(n) - lf(i) - lf(n - i) - n * Math.log(2));
  void logC;
  const lo = Math.min(k, n - k);
  let p = 0;
  for (let i = 0; i <= lo; i++) p += pmf(i);
  return Math.min(1, 2 * p);
}
const pct = (a: number, b: number) => (b ? `${((100 * a) / b).toFixed(0)}%` : '-');

const A = load(listAfter('--a'));
const B = load(listAfter('--b'));
const bByQ = new Map(B.map(i => [i.q, i]));
const pairs = A.filter(a => a.toolOk !== null && bByQ.get(a.q)?.toolOk != null).map(a => ({ a, b: bByQ.get(a.q)! }));
const okA = pairs.filter(p => p.a.toolOk).length;
const okB = pairs.filter(p => p.b.toolOk).length;
const onlyA = pairs.filter(p => p.a.toolOk && !p.b.toolOk).length; // baseline right, candidate wrong
const onlyB = pairs.filter(p => !p.a.toolOk && p.b.toolOk).length;
const [la, ha] = wilson(okA, pairs.length);
const [lb, hb] = wilson(okB, pairs.length);
console.log(`matched scored questions: ${pairs.length} (A has ${A.length} items, B has ${B.length})`);
console.log(`A (baseline) : ${okA}/${pairs.length} = ${pct(okA, pairs.length)}  Wilson 95% ${(la * 100).toFixed(0)}-${(ha * 100).toFixed(0)}%`);
console.log(`B (candidate): ${okB}/${pairs.length} = ${pct(okB, pairs.length)}  Wilson 95% ${(lb * 100).toFixed(0)}-${(hb * 100).toFixed(0)}%`);
console.log(`discordant: only A right ${onlyA}, only B right ${onlyB}; exact McNemar p = ${binomTwoSided(onlyB, onlyA + onlyB).toFixed(4)}`);
console.log('\ncategory        A        B      (only A / only B)');
for (const cat of [...new Set(pairs.map(p => p.a.cat))].sort()) {
  const g = pairs.filter(p => p.a.cat === cat);
  console.log(`${cat.padEnd(12)} ${`${g.filter(p => p.a.toolOk).length}/${g.length}`.padStart(7)} ${`${g.filter(p => p.b.toolOk).length}/${g.length}`.padStart(8)}     (${g.filter(p => p.a.toolOk && !p.b.toolOk).length} / ${g.filter(p => !p.a.toolOk && p.b.toolOk).length})`);
}
const worse = pairs.filter(p => p.a.toolOk && !p.b.toolOk).slice(0, 10);
if (worse.length) console.log('\nregressions (A right, B wrong), first 10:\n' + worse.map(p => `  [${p.a.cat}] ${p.a.q.slice(0, 70)}`).join('\n'));
