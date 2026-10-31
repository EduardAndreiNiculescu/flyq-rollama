/**
 * Aggregate benchmark result files (laptop or phone) into one report: tool choice per category with Wilson 95% intervals,
 * flight codes in answers that appear nowhere in the question or the real flight, repeated answer openers, latency.
 *   npx tsx scripts/analyze-bench.ts eval/results/laptop-seed1*-bench-*.json [--flight KL1960]
 */
import { readFileSync } from 'node:fs';

const files = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const flightFlag = process.argv.indexOf('--flight');

function wilson(k: number, n: number, z = 1.959964) {
  if (!n) return { p: NaN, lo: NaN, hi: NaN };
  const p = k / n;
  const d = 1 + (z * z) / n;
  const c = (p + (z * z) / (2 * n)) / d;
  const h = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return { p, lo: c - h, hi: c + h };
}
const pct = (x: number) => (Number.isNaN(x) ? '–' : `${Math.round(x * 100)}%`);
const med = (a: number[]) => (a.length ? [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)] : null);

type Item = { q: string; cat: string; expect: string[]; answer: string; ms: number; tools: string[]; toolOk: boolean | null; error?: string | null; seed?: number; flight?: string };
const items: Item[] = [];
for (const f of files) {
  const j = JSON.parse(readFileSync(f, 'utf8'));
  for (const it of j.items) items.push({ ...it, seed: j.seed, flight: j.flight });
}
if (!items.length) {
  console.error('no result files given');
  process.exit(1);
}
console.log(`${files.length} fișier(e), ${items.length} întrebări\n`);

const scored = items.filter((i) => i.toolOk !== null);
const ok = scored.filter((i) => i.toolOk).length;
const w = wilson(ok, scored.length);
console.log(`ALEGEREA UNELTEI (prima unealtă): ${ok}/${scored.length} = ${pct(w.p)}  Wilson 95%: ${pct(w.lo)} – ${pct(w.hi)}\n`);

console.log('categorie     corect    %     Wilson 95%');
const cats = [...new Set(items.map((i) => i.cat))].sort();
for (const c of cats) {
  const g = scored.filter((i) => i.cat === c);
  if (!g.length) {
    console.log(`${c.padEnd(12)}  nescorat (${items.filter((i) => i.cat === c).length} întrebări)`);
    continue;
  }
  const k = g.filter((i) => i.toolOk).length;
  const x = wilson(k, g.length);
  console.log(`${c.padEnd(12)}  ${`${k}/${g.length}`.padEnd(8)} ${pct(x.p).padStart(4)}   ${pct(x.lo)} – ${pct(x.hi)}`);
}

// Flight codes the model wrote that are in neither the question nor the real flight of that run.
const CODE = /\b[A-Z]{2}\d{3,4}\b/g;
const fab = items.filter((i) => {
  const allowed = new Set([...(i.q.toUpperCase().match(CODE) ?? []), ...(i.flight ? [i.flight.toUpperCase()] : [])]);
  return (i.answer.match(CODE) ?? []).some((c) => !allowed.has(c));
});
console.log(`\nCOD DE ZBOR INVENTAT în răspuns: ${fab.length}/${items.length}  (${pct(wilson(fab.length, items.length).p)}, Wilson ${pct(wilson(fab.length, items.length).lo)} – ${pct(wilson(fab.length, items.length).hi)})`);
for (const i of fab.slice(0, 8)) console.log(`  "${i.q.slice(0, 48)}" -> ${(i.answer.match(CODE) ?? []).join(', ')}`);

const openers = new Map<string, number>();
for (const i of items) if (i.answer) openers.set(i.answer.slice(0, 50), (openers.get(i.answer.slice(0, 50)) ?? 0) + 1);
const rep = [...openers.entries()].filter(([, n]) => n >= 4).sort((a, b) => b[1] - a[1]);
console.log(`\nÎNCEPUTURI DE RĂSPUNS REPETATE (≥4 ori):`);
for (const [t, n] of rep.slice(0, 8)) console.log(`  ${n}×  "${t}"`);

const wrong = scored.filter((i) => !i.toolOk);
const byWrong = new Map<string, number>();
for (const i of wrong) byWrong.set(`${i.expect.join('|') || 'fără'} -> ${i.tools.join(',') || 'nimic'}`, (byWrong.get(`${i.expect.join('|') || 'fără'} -> ${i.tools.join(',') || 'nimic'}`) ?? 0) + 1);
console.log(`\nCELE MAI FRECVENTE ALEGERI GREȘITE (așteptat -> ales):`);
for (const [k, n] of [...byWrong.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)) console.log(`  ${n}×  ${k}`);

console.log(`\nviteză: mediană ${((med(items.map((i) => i.ms)) ?? 0) / 1000).toFixed(1)} s/răspuns · erori de rețea/gateway: ${items.filter((i) => i.error).length}`);
void flightFlag;
