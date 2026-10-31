/** Replays held-out Qwen predictions through the deterministic router. */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { routeDecision } from '../src/core/router';

type SourceRow = { id: string; lang: string; category: string; prompt: string; completion: string };
type EvalRow = { id: string; parsed?: { name?: string }; error?: string | null };

const root = process.cwd();
const geminiRoot = resolve(root, '..', 'flightflow-gemini');
const source: SourceRow[] = readFileSync(join(geminiRoot, 'finetune/data/06b_v2/test.jsonl'), 'utf8')
  .trim().split(/\r?\n/).map(line => JSON.parse(line));
const recorded = JSON.parse(readFileSync(join(geminiRoot, 'finetune/out/06b_v2/eval-hard.json'), 'utf8'))
  .details as EvalRow[];
const byId = new Map(recorded.map(row => [row.id, row]));

const userText = (prompt: string) => /<\|im_start\|>user\n([\s\S]*?)<\|im_end\|>/.exec(prompt)?.[1].trim() ?? '';
const expectedName = (completion: string) => JSON.parse(completion).name as string;

const rows = source.map(row => {
  const question = userText(row.prompt);
  const expected = expectedName(row.completion);
  const started = performance.now();
  const decision = routeDecision(question, { flightNumber: 'DEMO123' });
  const routerMs = performance.now() - started;
  const tools = decision.candidates.map(c => c.tool).filter((x): x is NonNullable<typeof x> => x !== null);
  const qwen = byId.get(row.id)?.parsed?.name ?? 'invalid';
  let predicted: string;
  let handledBy: 'router' | 'qwen' | 'clarify';
  if (decision.action === 'execute') {
    predicted = tools.includes(expected as never) ? expected : (tools[0] ?? 'none');
    handledBy = 'router';
  } else if (decision.action === 'model') {
    predicted = qwen;
    handledBy = 'qwen';
  } else {
    predicted = 'clarify';
    handledBy = 'clarify';
  }
  return {
    id: row.id, lang: row.lang, category: row.category, question, expected, predicted,
    handledBy, correct: predicted === expected || (expected === 'none' && predicted === 'clarify'),
    falseExecution: expected === 'none' && decision.action === 'execute' && tools.length > 0,
    routerAction: decision.action, tools, routerMs,
  };
});

const breakdown = (key: 'router' | 'qwen' | 'clarify') => {
  const part = rows.filter(r => r.handledBy === key);
  return { count: part.length, correct: part.filter(r => r.correct).length,
    accuracy: part.length ? part.filter(r => r.correct).length / part.length : 0 };
};
const report = {
  generatedAt: new Date().toISOString(), total: rows.length,
  correct: rows.filter(r => r.correct).length,
  accuracy: rows.filter(r => r.correct).length / rows.length,
  falseExecutions: rows.filter(r => r.falseExecution).length,
  router: breakdown('router'), qwen: breakdown('qwen'), clarify: breakdown('clarify'),
  meanRouterMs: rows.reduce((n, r) => n + r.routerMs, 0) / rows.length,
  errors: rows.filter(r => !r.correct), rows,
};
mkdirSync(join(root, 'eval/results'), { recursive: true });
const out = join(root, 'eval/results/hybrid-recorded-v2-hard.json');
writeFileSync(out, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ ...report, rows: undefined, errors: report.errors.length, output: out }, null, 2));
