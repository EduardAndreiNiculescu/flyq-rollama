/**
 * Tool-calling evaluation: does the model request the right tool, with valid arguments, and stay
 * quiet when no tool is appropriate (greetings, off-topic, prompt injection)?
 *
 *   npx tsx eval/run-tools.ts --models base,adapter --base http://127.0.0.1:18081/v1
 *
 * Only the FIRST model turn is scored (tool selection + argument validity). Arguments are validated
 * with the same schema the app enforces at runtime. Desktop evaluation, not on-device.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chat } from './lib/chat';
import { buildSystemMessage } from '../src/core/prompt';
import { contractFromEnv } from '../src/llm/contract';
import { modelToolSpecs, STATIC_SYSTEM_V4 } from '../src/llm/contractV4';
import { createTools, toolSpecs } from '../src/tools/registry';
import { validateArgs } from '../src/tools/schema';

export type ToolCase = { id: string; category: string; lang: 'ro' | 'en'; question: string; expectedAny: string[]; forbidden: string[] };
export type ToolScore = { pass: boolean; reasons: string[]; called: string[]; argsValid: boolean };

const TOOLS = createTools();

export function scoreToolCase(c: ToolCase, calls: { name: string; arguments: string }[]): ToolScore {
  const reasons: string[] = [];
  let argsValid = true;
  for (const call of calls) {
    const def = TOOLS.find((t) => t.name === call.name);
    if (!def) { reasons.push(`unknown tool "${call.name}"`); argsValid = false; continue; }
    const v = validateArgs(def.parameters, call.arguments);
    if (!v.ok) { reasons.push(`${call.name}: invalid arguments (${v.error})`); argsValid = false; }
  }
  const called = calls.map((x) => x.name);
  for (const f of c.forbidden) if (called.includes(f)) reasons.push(`called forbidden tool ${f}`);
  if (c.expectedAny.length === 0) {
    if (calls.length > 0) reasons.push(`expected no tool, got ${called.join(', ')}`);
  } else if (!called.some((n) => c.expectedAny.includes(n))) {
    reasons.push(calls.length ? `expected one of ${c.expectedAny.join('/')}, got ${called.join(', ')}` : `expected a call to ${c.expectedAny.join('/')}, got none`);
  }
  return { pass: reasons.length === 0, reasons, called, argsValid };
}

const SYSTEM_NOTE = '(no documents provided; call search_knowledge when you need passenger information, and use the flight tools for flight data)';

export async function runTools(o: { base: string; models: string[]; cases: ToolCase[]; log?: (s: string) => void }) {
  const specs = toolSpecs(TOOLS);
  const now = new Date('2026-10-31T09:00:00Z');
  const out: Record<string, (ToolScore & { id: string; category: string; ms: number; text: string; toolCalls: { name: string; arguments: string }[] })[]> = {};
  for (const model of o.models) {
    out[model] = [];
    for (const c of o.cases) {
      const v4 = contractFromEnv(process.env.FF_CONTRACT) === 'v4';
      // v4: the static compact contract; otherwise today's prompt, exactly as before
      const system = v4 ? STATIC_SYSTEM_V4 : buildSystemMessage({ flightFacts: null, documents: SYSTEM_NOTE, now, context: { flightNumber: 'DEMO123', connectionAvailable: false } });
      const r = await chat(o.base, model, [{ role: 'system', content: system }, { role: 'user', content: c.question }], { tools: v4 ? modelToolSpecs() : specs, maxTokens: 200, temperature: 0.2 });
      out[model].push({ id: c.id, category: c.category, ms: r.ms, text: r.text, toolCalls: r.toolCalls, ...scoreToolCase(c, r.toolCalls) });
      o.log?.(`${model} ${out[model].length}/${o.cases.length}`);
    }
  }
  return out;
}

export function formatToolTable(out: Awaited<ReturnType<typeof runTools>>, models: string[]): string {
  const lines = ['\n=== tool calling ===', ['metric', ...models].join(' | ')];
  const pct = (a: number, b: number) => (b ? `${((100 * a) / b).toFixed(0)}%` : '-');
  const rowsOf = (m: string) => out[m];
  lines.push(['passed', ...models.map((m) => `${rowsOf(m).filter((r) => r.pass).length}/${rowsOf(m).length}`)].join(' | '));
  lines.push(['calls with invalid arguments / unknown tool', ...models.map((m) => String(rowsOf(m).filter((r) => !r.argsValid).length))].join(' | '));
  lines.push(['forbidden tool called', ...models.map((m) => String(rowsOf(m).filter((r) => r.reasons.some((x) => x.startsWith('called forbidden'))).length))].join(' | '));
  lines.push(['called a tool when none was expected', ...models.map((m) => String(rowsOf(m).filter((r) => r.category === 'none' && r.called.length > 0).length))].join(' | '));
  lines.push(['no call when one was expected', ...models.map((m) => String(rowsOf(m).filter((r) => r.category !== 'none' && r.called.length === 0).length))].join(' | '));
  const cats = [...new Set(rowsOf(models[0]).map((r) => r.category))];
  for (const c of cats) lines.push([`  ${c}`, ...models.map((m) => { const rs = rowsOf(m).filter((r) => r.category === c); return `${rs.filter((r) => r.pass).length}/${rs.length} (${pct(rs.filter((r) => r.pass).length, rs.length)})`; })].join(' | '));
  if (models.length === 2) {
    const [a, b] = models;
    const diff = out[a].map((r, i) => ({ r, o: out[b][i] })).filter(({ r, o }) => r.pass !== o.pass);
    lines.push(`\n  ${diff.length} cases differ; first 8:`);
    for (const { r, o } of diff.slice(0, 8)) lines.push(`  ${r.id} [${r.category}] ${a}=${r.pass ? 'PASS' : `FAIL (${r.reasons.join('; ')})`} | ${b}=${o.pass ? 'PASS' : `FAIL (${o.reasons.join('; ')})`}`);
  }
  return lines.join('\n');
}

async function main() {
  const arg = (n: string, d: string) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : d; };
  const models = arg('models', 'base,adapter').split(',');
  const cases: ToolCase[] = JSON.parse(readFileSync(fileURLToPath(new URL(`./${arg('cases', 'tool-cases.json')}`, import.meta.url)), 'utf8')).slice(0, Number(arg('limit', '1000')));
  const out = await runTools({ base: arg('base', 'http://127.0.0.1:18081/v1'), models, cases, log: (s) => process.stdout.write(`\r${s}   `) });
  console.log(formatToolTable(out, models));
  mkdirSync(new URL('./results/', import.meta.url), { recursive: true });
  const file = new URL(`./results/tools-${new Date().toISOString().replace(/[:.]/g, '-')}.json`, import.meta.url);
  writeFileSync(file, JSON.stringify({ models, out }, null, 1));
  console.log(`\nraw outputs saved: ${fileURLToPath(file)}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
