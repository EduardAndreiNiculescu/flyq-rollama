/**
 * Reproducible benchmark of the deterministic layer (no model, no network): normalizer -> capability boundary -> fast path.
 *   npx tsx scripts/bench-tier1.ts [--json out.json]
 * Runs the 1000 stress questions (eval/stress_1000.json) and reports, separately:
 *   - how many questions the rules decide on their own (and how many of those decisions are wrong),
 *   - how many are left for the RoLlama router (not executed here: it needs the GGUF on a device),
 *   - the latency of the rules (this is NOT model latency).
 * "wrong" means the rules produced a tool name different from the expected one, which would be a false execution.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { capabilityBoundary } from '../src/core/capability';
import { normalizePassengerQuery } from '../src/llm/rollama';
import { toolFor } from '../src/tools/fastPath';

type Sample = { id: number; query: string; expected_tool: string; category?: string };
const data = JSON.parse(readFileSync(new URL('../eval/stress_1000.json', import.meta.url), 'utf8')) as Sample[];

const tiers: Record<string, { n: number; correct: number }> = { capability: { n: 0, correct: 0 }, fast_path: { n: 0, correct: 0 }, left_for_model: { n: 0, correct: 0 } };
const wrong: Array<{ id: number; query: string; expected: string; got: string; tier: string }> = [];
const lat: number[] = [];
const leftByTool: Record<string, number> = {};

for (const s of data) {
  const t0 = performance.now();
  const clean = normalizePassengerQuery(s.query);
  let tier: string, got: string | null;
  if (capabilityBoundary(clean)) (tier = 'capability'), (got = 'none');
  else if ((got = toolFor(clean))) tier = 'fast_path';
  else (tier = 'left_for_model'), (got = null);
  lat.push(performance.now() - t0);
  tiers[tier].n++;
  if (tier === 'left_for_model') leftByTool[s.expected_tool] = (leftByTool[s.expected_tool] ?? 0) + 1;
  else if (got === s.expected_tool) tiers[tier].correct++;
  else wrong.push({ id: s.id, query: s.query, expected: s.expected_tool, got: got ?? '', tier });
}
lat.sort((a, b) => a - b);
const decided = tiers.capability.n + tiers.fast_path.n;
const decidedOk = tiers.capability.correct + tiers.fast_path.correct;
const pct = (a: number, b: number) => (b ? ((100 * a) / b).toFixed(1) : '0.0');
const report = {
  samples: data.length,
  decided_by_rules: decided,
  decided_pct: pct(decided, data.length),
  rule_decisions_correct: decidedOk,
  rule_decisions_wrong: decided - decidedOk,
  rule_precision_pct: pct(decidedOk, decided),
  left_for_model: tiers.left_for_model.n,
  left_by_expected_tool: leftByTool,
  tiers,
  latency_ms: { median: +lat[Math.floor(lat.length / 2)].toFixed(4), p95: +lat[Math.floor(lat.length * 0.95)].toFixed(4), max: +lat[lat.length - 1].toFixed(4) },
  note: 'Rules only. The model tier is not run here; its accuracy and latency need the GGUF on a device (see docs/REPRODUCE.md).',
};
console.log(JSON.stringify(report, null, 2));
if (wrong.length) console.log(`\nwrong rule decisions (first 10 of ${wrong.length}):\n` + wrong.slice(0, 10).map((w) => `  #${w.id} [${w.tier}] expected ${w.expected}, rules said ${w.got}: ${w.query}`).join('\n'));
const out = process.argv.indexOf('--json');
if (out > 0) writeFileSync(process.argv[out + 1], JSON.stringify({ ...report, wrong }, null, 2));
