/**
 * Reproducible benchmark of the deterministic layer (no model, no network): normalizer -> capability boundary -> fast path.
 *   npx tsx scripts/bench-tier1.ts [--json out.json]
 * Runs the 1000 stress questions (eval/stress_1000.json) twice and reports them separately:
 *   1. STRICT-EQUIVALENT: the Python benchmark's rules ported one to one (src/core/tier1.ts, strict mode), compared with the numbers
 *      that benchmark published. This shows whether the TypeScript port decides like the Python code.
 *   2. APP RUNTIME: what the app really does (capability boundary with its extra patterns and exceptions, the exact-phrase fast path
 *      plus the ported rules, and the safety guards). Only some decisions run without the model (see `runs_without_model`).
 * "wrong" means the rules produced a tool name different from the expected one, i.e. a false execution or a false refusal.
 * The rules were written while looking at this very set, so high numbers here say nothing about unseen passenger questions.
 * The model tier (RoLlama) is not run here: it needs the GGUF on a device (docs/REPRODUCE.md).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { capabilityBoundary } from '../src/core/capability';
import { tier1Capability, tier1FastTool } from '../src/core/tier1';
import { normalizePassengerQuery } from '../src/llm/rollama';
import { toolFor } from '../src/tools/fastPath';

type Sample = { id: number; query: string; expected_tool: string; category?: string };
const data = JSON.parse(readFileSync(new URL('../eval/stress_1000.json', import.meta.url), 'utf8')) as Sample[];

/** Published by the Python benchmark (finetune/out/stress_1000_results.json): rules 185 + 426 = 611 decided, 389 left for the model, 0 rule errors. */
const PYTHON_PUBLISHED = { capability: 185, fast_path: 426, left_for_model: 389 };
/** Tools the app can execute from the fast path without the model (map needs a destination; the rest need only the question). */
const RUNS_WITHOUT_MODEL = new Set(['get_flight_details', 'get_gate', 'get_time_remaining', 'get_live_tracking', 'search_knowledge']);

type Decision = { tier: 'capability' | 'fast_path' | 'left_for_model'; tool: string | null };
function evaluate(decide: (raw: string, clean: string) => Decision) {
  const tiers = { capability: 0, fast_path: 0, left_for_model: 0 };
  const wrong: Array<{ id: number; query: string; expected: string; got: string; tier: string }> = [];
  const lat: number[] = [];
  let ok = 0;
  let withoutModel = 0;
  for (const s of data) {
    const t0 = performance.now();
    const clean = normalizePassengerQuery(s.query);
    const d = decide(s.query, clean);
    lat.push(performance.now() - t0);
    tiers[d.tier]++;
    if (d.tier === 'left_for_model') continue;
    if (d.tool === s.expected_tool) {
      ok++;
      if (d.tier === 'capability' || (d.tool && RUNS_WITHOUT_MODEL.has(d.tool))) withoutModel++;
    } else wrong.push({ id: s.id, query: s.query, expected: s.expected_tool, got: d.tool ?? '', tier: d.tier });
  }
  lat.sort((a, b) => a - b);
  const decided = tiers.capability + tiers.fast_path;
  const pct = (a: number, b: number) => (b ? +((100 * a) / b).toFixed(1) : 0);
  return {
    decided_by_rules: decided,
    decided_pct: pct(decided, data.length),
    tiers,
    correct: ok,
    wrong: decided - ok,
    precision_pct: pct(ok, decided),
    runs_without_model: withoutModel,
    runs_without_model_pct: pct(withoutModel, data.length),
    left_for_model: tiers.left_for_model,
    latency_ms: { median: +lat[Math.floor(lat.length / 2)].toFixed(4), p95: +lat[Math.floor(lat.length * 0.95)].toFixed(4), max: +lat[lat.length - 1].toFixed(4) },
    wrongList: wrong,
  };
}

const strict = evaluate((_raw, clean) => {
  if (tier1Capability(clean, true)) return { tier: 'capability', tool: 'none' };
  const t = tier1FastTool(clean);
  return t ? { tier: 'fast_path', tool: t } : { tier: 'left_for_model', tool: null };
});

const runtime = evaluate((raw, clean) => {
  if (capabilityBoundary(clean)) return { tier: 'capability', tool: 'none' };
  const t = toolFor(raw);
  return t ? { tier: 'fast_path', tool: t } : { tier: 'left_for_model', tool: null };
});

const report = {
  samples: data.length,
  python_published: PYTHON_PUBLISHED,
  strict_equivalent: { ...strict, vs_python: { capability: strict.tiers.capability - PYTHON_PUBLISHED.capability, fast_path: strict.tiers.fast_path - PYTHON_PUBLISHED.fast_path, left_for_model: strict.tiers.left_for_model - PYTHON_PUBLISHED.left_for_model } },
  app_runtime: runtime,
  note: 'Rules only; written while looking at this set. The model tier is not run here (needs the GGUF on a device).',
};
const { wrongList: sw, ...sCompact } = report.strict_equivalent;
const { wrongList: rw, ...rCompact } = report.app_runtime;
console.log(JSON.stringify({ ...report, strict_equivalent: sCompact, app_runtime: rCompact }, null, 2));
for (const [label, list] of [['STRICT-EQUIVALENT', sw], ['APP RUNTIME', rw]] as const) {
  if (list.length) console.log(`\n${label}: wrong rule decisions (first 8 of ${list.length}):\n` + list.slice(0, 8).map((w) => `  #${w.id} [${w.tier}] expected ${w.expected}, rules said ${w.got}: ${w.query}`).join('\n'));
}
const out = process.argv.indexOf('--json');
if (out > 0) writeFileSync(process.argv[out + 1], JSON.stringify(report, null, 2));
