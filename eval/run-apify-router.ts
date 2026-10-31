import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { routeDecision } from '../src/core/router';

type DiscoveryCase = {
  id: string;
  question: string;
  lang?: string;
  expectedAny: string[];
  expectedAction?: 'execute' | 'clarify' | 'none';
  forbidden: string[];
  origin?: string;
  sourceName?: string;
  verified?: boolean;
  query?: string;
};

const root = process.cwd();
const inputArg = process.argv.indexOf('--input');
const input = inputArg >= 0 && process.argv[inputArg + 1]
  ? join(root, process.argv[inputArg + 1])
  : join(root, 'eval', 'apify-flight-discovery.json');
const cases: DiscoveryCase[] = JSON.parse(readFileSync(input, 'utf8'));

const rows = cases.map((c) => {
  const started = performance.now();
  const decision = routeDecision(c.question, { flightNumber: 'DEMO123' });
  const ms = performance.now() - started;
  const tools: string[] = decision.candidates.flatMap((x) => (x.tool ? [x.tool] : []));
  const forbidden = decision.action === 'execute' && tools.some((t) => c.forbidden.includes(t));
  const labelAgreement = c.expectedAny.length > 0
    ? c.expectedAny.some((t) => tools.includes(t))
    : c.expectedAction === 'none'
      ? decision.action !== 'execute'
      : c.expectedAction === decision.action;
  return {
    ...c,
    action: decision.action,
    tools,
    confidence: decision.confidence,
    reason: decision.reason,
    labelAgreement,
    forbidden,
    ms,
  };
});

const latency = rows.map((r) => r.ms).sort((a, b) => a - b);
const countBy = (key: (row: (typeof rows)[number]) => string) =>
  Object.fromEntries([...new Set(rows.map(key))].sort().map((v) => [v, rows.filter((r) => key(r) === v).length]));
const report = {
  generatedAt: new Date().toISOString(),
  source: input.endsWith('web-routing-supplement.json')
    ? 'Web FAQ supplement; human-authored paraphrases with per-case provenance'
    : input.endsWith('ro-human-stress-500.json')
      ? 'Deterministic Romanian human-style robustness stress benchmark'
      : 'Apify web discovery; heuristic labels are unverified and are not ground truth',
  total: rows.length,
  verifiedGroundTruth: rows.filter((r) => r.verified).length,
  heuristicLabelAgreement: rows.filter((r) => r.labelAgreement).length / rows.length,
  directCoverage: rows.filter((r) => r.action === 'execute').length / rows.length,
  clarifyRate: rows.filter((r) => r.action === 'clarify').length / rows.length,
  modelFallbackRate: rows.filter((r) => r.action === 'model').length / rows.length,
  forbiddenExecutions: rows.filter((r) => r.forbidden).length,
  medianMs: latency[Math.floor(latency.length / 2)] ?? 0,
  p95Ms: latency[Math.floor(latency.length * 0.95)] ?? 0,
  labels: countBy((r) => r.expectedAny.join('+') || r.expectedAction || '(none)'),
  predictedActions: countBy((r) => r.action),
  predictedTools: countBy((r) => r.tools.join('+') || '(none)'),
  origins: countBy((r) => r.origin || r.sourceName || '(unknown)'),
  rows,
};

mkdirSync(join(root, 'eval', 'results'), { recursive: true });
const output = join(root, 'eval', 'results', `apify-router-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
writeFileSync(output, JSON.stringify(report, null, 2), 'utf8');
console.log(JSON.stringify({ ...report, rows: undefined, output }, null, 2));
