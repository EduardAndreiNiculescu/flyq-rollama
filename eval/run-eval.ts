/**
 * Phase 7 evaluation. Runs on a DESKTOP against an OpenAI-compatible endpoint (e.g. Ollama).
 * This evaluates prompts/retrieval only; it is NOT the on-device benchmark.
 *
 *   npx tsx eval/run-eval.ts --model qwen3:4b --base http://localhost:11434/v1 [--limit 10]
 *
 * Conditions: A base model, B system prompt (+deterministic flight facts), C = B + offline retrieval.
 * Scoring is automatic regex matching (mustAny / mustNot) - a coarse proxy; read the raw outputs.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { routeIntent } from '../src/core/assistant';
import { DEMO_FLIGHTS, flightFacts, getFlight } from '../src/core/flight';
import { formatForPrompt, retrieve } from '../src/core/knowledge';
import { buildSystemMessage, detectLang } from '../src/core/prompt';

type Q = { id: string; category: string; lang: 'en' | 'ro'; question: string; mustAny: string[]; mustNot: string[] };

const arg = (n: string, d: string) => {
  const i = process.argv.indexOf(`--${n}`);
  return i > 0 ? process.argv[i + 1] : d;
};
const MODEL = arg('model', 'qwen3:4b');
const BASE = arg('base', 'http://localhost:11434/v1');
const LIMIT = Number(arg('limit', '1000'));
const NOW = new Date('2026-10-31T09:00:00Z'); // fixed clock for reproducibility

const questions: Q[] = JSON.parse(readFileSync(new URL('./questions.json', import.meta.url), 'utf8')).slice(0, LIMIT);

function messagesFor(cond: 'A' | 'B' | 'C', q: string) {
  if (cond === 'A') return [{ role: 'user', content: q }];
  const intent = routeIntent(q);
  const f = ['GET_FLIGHT_DETAILS', 'GET_FLIGHT_TIME_REMAINING'].includes(intent.intent) || /DEMO123|flight|zbor/i.test(q)
    ? getFlight(intent.args.flightNumber ?? 'DEMO123', DEMO_FLIGHTS) : null;
  const docs = cond === 'C' ? formatForPrompt(retrieve(q, detectLang(q), 3)) : '(none)';
  const system = buildSystemMessage({ flightFacts: f ? flightFacts(f, NOW) : null, documents: docs, now: NOW,
    context: { connectionAvailable: false, flightNumber: 'DEMO123' } });
  return [{ role: 'system', content: system }, { role: 'user', content: q }];
}

async function chat(messages: unknown[]) {
  const t0 = Date.now();
  const r = await fetch(`${BASE}/chat/completions`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODEL, messages, temperature: 0.7, top_p: 0.8, max_tokens: 400, stream: false }),
  });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  const j: any = await r.json();
  const text = String(j.choices[0].message.content ?? '').replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  return { text, ms: Date.now() - t0 };
}

function score(q: Q, text: string) {
  const any = q.mustAny.some((p) => new RegExp(p, 'i').test(text));
  const bad = q.mustNot.some((p) => new RegExp(p, 'im').test(text));
  return { correct: any && !bad, unsupported: bad };
}

async function main() {
  const rows: any[] = [];
  for (const cond of ['A', 'B', 'C'] as const) {
    for (const q of questions) {
      try {
        const { text, ms } = await chat(messagesFor(cond, q.question));
        rows.push({ cond, id: q.id, category: q.category, lang: q.lang, ms, text, ...score(q, text) });
      } catch (e) {
        rows.push({ cond, id: q.id, category: q.category, error: String(e) });
      }
      process.stdout.write('.');
    }
  }
  mkdirSync(new URL('./results/', import.meta.url), { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  writeFileSync(new URL(`./results/${stamp}-${MODEL.replace(/[^\w.-]/g, '_')}.json`, import.meta.url), JSON.stringify({ model: MODEL, base: BASE, rows }, null, 1));
  console.log('\nCondition | n | correct | unsupported-claim hits | median ms');
  for (const c of ['A', 'B', 'C']) {
    const r = rows.filter((x) => x.cond === c && !x.error);
    const ms = r.map((x) => x.ms).sort((a, b) => a - b);
    console.log(`${c} | ${r.length} | ${r.filter((x) => x.correct).length} | ${r.filter((x) => x.unsupported).length} | ${ms[Math.floor(ms.length / 2)] ?? '-'}`);
  }
}
main();
