/**
 * The same randomized benchmark as the phone's (src/bench/questions.ts), run through the laptop gateway + Ollama model,
 * so phone and laptop numbers are comparable question by question.
 *   GATEWAY_TOKEN=... npx tsx scripts/laptop-bench.ts --flight BA875 --n 100 --seed 2026
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { generateBench, toolOk } from '../src/bench/questions';

const base = process.env.GATEWAY_URL ?? 'http://127.0.0.1:18090';
const token = process.env.GATEWAY_TOKEN ?? '';
const args = process.argv.slice(2);
const flag = (n: string, d: string) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? args[i + 1] : d;
};
const n = Number(flag('n', '100'));
const seed = Number(flag('seed', '2026'));
const flight = flag('flight', 'KL1375');
const label = flag('label', 'laptop');

const med = (a: number[]) => (a.length ? [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)] : null);

async function main() {
  const qs = generateBench(n, seed);
  console.log(`${label}: ${qs.length} întrebări, seed ${seed}, zbor ${flight}`);
  const items: any[] = [];
  for (const q of qs) {
    const t0 = Date.now();
    let text = '';
    let tools: string[] = [];
    let error: string | null = null;
    try {
      const res = await fetch(`${base}/v1/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ question: q.q.slice(0, 480), flightNumber: flight }),
      });
      const j: any = await res.json();
      if (!res.ok) error = `${res.status} ${j.error ?? ''}`;
      else {
        text = j.text;
        tools = (j.trace ?? []).map((t: any) => t.name);
      }
    } catch (e) {
      error = String(e);
    }
    const ms = Date.now() - t0;
    const ok = error ? null : toolOk(q.expect, tools);
    items.push({ i: items.length, id: q.id, q: q.q, cat: q.cat, expect: q.expect, answer: text.slice(0, 800), ms, source: label, tools, toolOk: ok, error });
    console.log(`${String(items.length).padStart(3)}/${qs.length} ${q.cat.padEnd(9)} ${(ms / 1000).toFixed(1).padStart(5)}s ${ok === null ? ' ' : ok ? 'ok' : 'NU'} [${tools.join(',') || '-'}] ${q.q}`);
  }
  const scored = items.filter((i) => i.toolOk !== null);
  const byCategory = Object.fromEntries(
    [...new Set(items.map((i) => i.cat))].map((c) => {
      const g = items.filter((i) => i.cat === c && i.toolOk !== null);
      return [c, g.length ? `${g.filter((i) => i.toolOk).length}/${g.length}` : 'nescorat'];
    }),
  );
  const summary = { n: items.length, source: label, medianMs: med(items.map((i) => i.ms)), toolChoice: { ok: scored.filter((i) => i.toolOk).length, of: scored.length }, errors: items.filter((i) => i.error).length, byCategory };
  mkdirSync(new URL('../eval/results/', import.meta.url), { recursive: true });
  const file = new URL(`../eval/results/${label}-bench-${new Date().toISOString().replace(/[:.]/g, '-')}.json`, import.meta.url);
  writeFileSync(file, JSON.stringify({ seed, flight, summary, items }, null, 1));
  console.log('\n=== rezumat ===\n' + JSON.stringify(summary, null, 1));
}
void main();
