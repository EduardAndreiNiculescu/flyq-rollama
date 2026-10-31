import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { routeDecision } from '../src/core/router';
import { writeLabStatus } from '../scripts/lab-status';

type ToolCase = { id: string; category: string; question: string; expectedAny: string[]; forbidden: string[] };
const root = process.cwd();
const cases: ToolCase[] = JSON.parse(readFileSync(join(root, 'eval', 'tool-cases-v4.json'), 'utf8'));
writeLabStatus(root, { actor: 'codex', stage: 'router', state: 'running', current: 0, total: cases.length, message: 'evaluare router' });

const rows = cases.map((c, index) => {
  const start = performance.now();
  const decision = routeDecision(c.question, { flightNumber: 'DEMO123' });
  const ms = performance.now() - start;
  const tools = decision.candidates.map(x => x.tool).filter(x => x !== null);
  const forbidden = decision.action === 'execute' && tools.some(t => c.forbidden.includes(t));
  const correct = c.expectedAny.length ? tools.some(t => c.expectedAny.includes(t)) : decision.action !== 'execute';
  if ((index + 1) % 10 === 0) writeLabStatus(root, { actor: 'codex', stage: 'router', state: 'running', current: index + 1, total: cases.length, message: 'evaluare router' });
  return { ...c, action: decision.action, tools, confidence: decision.confidence, reason: decision.reason, correct: correct && !forbidden, forbidden, ms };
});
const sortedMs = rows.map(r => r.ms).sort((a, b) => a - b);
const report = {
  generatedAt: new Date().toISOString(),
  total: rows.length,
  correct: rows.filter(r => r.correct).length,
  accuracy: rows.filter(r => r.correct).length / rows.length,
  direct: rows.filter(r => r.action === 'execute').length,
  coverage: rows.filter(r => r.action === 'execute').length / rows.length,
  falseExecution: rows.filter(r => r.forbidden).length,
  fallback: rows.filter(r => r.action === 'model').length,
  clarify: rows.filter(r => r.action === 'clarify').length,
  medianMs: sortedMs[Math.floor(sortedMs.length / 2)] ?? 0,
  rows,
};
mkdirSync(join(root, 'eval', 'results'), { recursive: true });
const out = join(root, 'eval', 'results', `router-06b-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
writeFileSync(out, JSON.stringify(report, null, 2), 'utf8');
const state = report.falseExecution === 0 ? 'passed' : 'failed';
writeLabStatus(root, { actor: 'codex', stage: 'router', state, current: rows.length, total: rows.length, message: out, metrics: { accuracy: report.accuracy.toFixed(3), coverage: report.coverage.toFixed(3), false_exec: report.falseExecution, median_ms: report.medianMs.toFixed(3) } });
console.log(JSON.stringify({ ...report, rows: undefined }, null, 2));
if (report.falseExecution) process.exitCode = 1;
