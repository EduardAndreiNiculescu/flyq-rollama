/**
 * Multi-turn evaluation: whole conversations through the app's real tool loop and REAL tools on fixed
 * fictional flights (no network), so every fact in a tool result is known and the final text can be checked.
 *
 *   FF_BACKEND=ollama-raw npx tsx eval/run-multi.ts --models ff-base,ff-adapter-v3 --base http://127.0.0.1:11435
 *
 * Per turn: which tools were requested (expected / forbidden) and what the final text says (must / must not match).
 * History between turns is text only (user + assistant), like the app. A flight number named by the passenger
 * becomes the selected flight for later turns (the app's sticky-flight rule). Side-effect tools are blocked by the
 * loop, as in the gateway; the request still counts as a call. Desktop evaluation, not on-device.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { ChatMessage, LlmEngine } from '../src/core/assistant';
import { getFlight } from '../src/core/flight';
import { toolPrompt, contractFromEnv } from '../src/llm/contract';
import { routeIntents } from '../src/core/router';
import { createTools, type ToolDeps } from '../src/tools/registry';
import { runToolLoop } from '../src/tools/loop';
import { TOOL_MODE_NOTE } from '../server/gateway/gateway';
import type { FlightRecord } from '../src/core/types';
import { chat } from './lib/chat';

export type Turn = { user: string; expectedAny?: string[]; forbidden?: string[]; must?: string[]; mustNot?: string[] };
export type Scenario = { id: string; lang: 'ro' | 'en' | 'mixed'; turns: Turn[] };
export type TurnScore = { pass: boolean; reasons: string[]; called: string[]; text: string };

export const FLIGHTS: FlightRecord[] = [
  { flightNumber: 'DEMO123', departureAirport: 'CRA', arrivalAirport: 'BGY', scheduledDeparture: '2026-10-31T12:45:00+02:00', scheduledArrival: '2026-10-31T14:10:00+01:00', gate: null, gateStatus: 'unconfirmed', dataSource: 'demo', lastUpdated: null },
  { flightNumber: 'RO311', departureAirport: 'OTP', arrivalAirport: 'CRA', scheduledDeparture: '2026-10-31T11:30:00+02:00', scheduledArrival: '2026-10-31T12:50:00+02:00', estimatedDeparture: '2026-10-31T12:05:00+02:00', estimatedArrival: '2026-10-31T13:25:00+02:00', departureDelayMin: 35, arrivalDelayMin: 35, providerStatus: 'scheduled', gate: 'B7', gateStatus: 'confirmed', dataSource: 'airlabs', lastUpdated: '2026-10-31T08:55:00Z' },
  { flightNumber: 'W61234', departureAirport: 'CRA', arrivalAirport: 'LTN', scheduledDeparture: '2026-10-31T12:00:00+02:00', scheduledArrival: '2026-10-31T14:10:00+00:00', estimatedDeparture: '2026-10-31T12:00:00+02:00', estimatedArrival: '2026-10-31T14:09:00+00:00', providerStatus: 'scheduled', gate: 'A3', gateStatus: 'confirmed', dataSource: 'airlabs', lastUpdated: '2026-10-31T08:55:00Z' },
];

const NOW = new Date('2026-10-31T09:00:00Z');

export function scoreTurn(t: Turn, called: string[], text: string): TurnScore {
  const reasons: string[] = [];
  const exp = t.expectedAny ?? [];
  if (exp.length === 0 && t.expectedAny && called.length) reasons.push(`expected no tool, got ${called.join(', ')}`);
  if (exp.length && !called.some((n) => exp.includes(n))) reasons.push(called.length ? `expected ${exp.join('/')}, got ${called.join(', ')}` : `expected ${exp.join('/')}, got no call`);
  for (const f of t.forbidden ?? []) if (called.includes(f)) reasons.push(`called forbidden ${f}`);
  for (const m of t.must ?? []) if (!new RegExp(m, 'i').test(text)) reasons.push(`answer lacks /${m}/`);
  for (const m of t.mustNot ?? []) if (new RegExp(m, 'i').test(text)) reasons.push(`answer contains /${m}/`);
  return { pass: reasons.length === 0, reasons, called, text };
}

function engineFor(base: string, model: string): LlmEngine {
  return {
    async generate(messages, _onToken, opts) {
      const r = await chat(base, model, messages as never, { tools: opts?.tools, maxTokens: opts?.maxTokens ?? 300, temperature: 0.2 });
      return { text: r.text, stats: { timeToFirstTokenMs: null, tokensPerSecond: null, totalMs: r.ms, tokens: 0 }, toolCalls: r.toolCalls.map((c) => ({ name: c.name, arguments: c.arguments })) };
    },
    async stop() {},
  };
}

export async function runScenario(engine: LlmEngine, s: Scenario): Promise<(TurnScore & { user: string })[]> {
  const history: ChatMessage[] = [];
  let sticky = 'DEMO123';
  const out: (TurnScore & { user: string })[] = [];
  for (const t of s.turns) {
    const named = routeIntents(t.user).find((i) => i.args.flightNumber)?.args.flightNumber;
    if (named && getFlight(named, FLIGHTS)) sticky = named;
    const deps: ToolDeps = { now: () => NOW, context: { flightNumber: sticky, connectionAvailable: true }, flights: FLIGHTS };
    const prompt = toolPrompt(contractFromEnv(process.env.FF_CONTRACT), { now: NOW, context: deps.context });
    const r = await runToolLoop(engine, [{ role: 'system', content: prompt.system }, ...history, { role: 'user', content: t.user }], deps, () => {}, { tools: createTools(), specs: prompt.specs, maxSteps: 3, maxTokens: 300, allowSideEffects: false });
    out.push({ user: t.user, ...scoreTurn(t, r.trace.map((x) => x.name), r.text) });
    history.push({ role: 'user', content: t.user }, { role: 'assistant', content: r.text });
  }
  return out;
}

async function main() {
  const arg = (n: string, d: string) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : d; };
  const models = arg('models', 'ff-base,ff-adapter-v3').split(',');
  const base = arg('base', 'http://127.0.0.1:11435');
  const scenarios: Scenario[] = JSON.parse(readFileSync(fileURLToPath(new URL(`./${arg('cases', 'multi-cases.json')}`, import.meta.url)), 'utf8'));
  const res: Record<string, Record<string, (TurnScore & { user: string })[]>> = {};
  for (const m of models) {
    res[m] = {};
    const engine = engineFor(base, m);
    for (const s of scenarios) {
      res[m][s.id] = await runScenario(engine, s);
      process.stdout.write(`\r${m} ${Object.keys(res[m]).length}/${scenarios.length}   `);
    }
  }
  console.log('\n\n=== multi-turn ===');
  console.log(['metric', ...models].join(' | '));
  const turnsOf = (m: string) => Object.values(res[m]).flat();
  console.log(['turns passed', ...models.map((m) => `${turnsOf(m).filter((t) => t.pass).length}/${turnsOf(m).length}`)].join(' | '));
  console.log(['conversations passed in full', ...models.map((m) => `${Object.values(res[m]).filter((ts) => ts.every((t) => t.pass)).length}/${scenarios.length}`)].join(' | '));
  for (const m of models) {
    console.log(`\n-- ${m}: failing turns`);
    for (const [id, ts] of Object.entries(res[m])) ts.forEach((t, i) => { if (!t.pass) console.log(`  ${id}#${i + 1} "${t.user}" -> ${t.reasons.join('; ')}${t.text ? ` | said: ${t.text.slice(0, 110).replace(/\n/g, ' ')}` : ''}`); });
  }
  mkdirSync(new URL('./results/', import.meta.url), { recursive: true });
  const file = new URL(`./results/multi-${new Date().toISOString().replace(/[:.]/g, '-')}.json`, import.meta.url);
  writeFileSync(file, JSON.stringify({ models, res }, null, 1));
  console.log(`\nraw outputs saved: ${fileURLToPath(file)}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
