/**
 * Hybrid Evaluation Benchmark: Router (FastPath) + Qwen3-0.6B Model Fallback
 * Measures the combined accuracy, coverage, and latency of the dual-tier architecture.
 *
 * Usage:
 *   npx tsx eval/run-hybrid.ts [--model flightflow-0.6b] [--base http://127.0.0.1:11434/v1]
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { routeDecision } from '../src/core/router';
import { chat } from './lib/chat';
import { STATIC_SYSTEM_V4 } from '../src/llm/contractV4';
import { modelToolSpecs } from '../src/llm/contractV4';
import { scoreToolCase, type ToolCase } from './run-tools';

export type HybridResultRow = {
  id: string;
  category: string;
  lang: string;
  question: string;
  handledBy: 'router' | 'model' | 'clarify';
  tools: string[];
  pass: boolean;
  reasons: string[];
  ms: number;
};

async function main() {
  const arg = (name: string, def: string) => {
    const idx = process.argv.indexOf(`--${name}`);
    return idx > 0 ? process.argv[idx + 1] : def;
  };

  const model = arg('model', 'flightflow-0.6b');
  const base = arg('base', 'http://127.0.0.1:11434/v1');
  const casesFile = new URL('./tool-cases-v4.json', import.meta.url);
  const cases: (ToolCase & { lang: string })[] = JSON.parse(readFileSync(fileURLToPath(casesFile), 'utf8'));

  console.log(`=== HYBRID BENCHMARK: Router + ${model} ===`);
  console.log(`Cases: ${cases.length} | Base URL: ${base}\n`);

  const rows: HybridResultRow[] = [];
  const routerLats: number[] = [];
  const modelLats: number[] = [];

  for (let i = 0; i < cases.length; i++) {
    const c = cases[i];
    const t0 = performance.now();
    const decision = routeDecision(c.question, { flightNumber: 'DEMO123' });
    const routerMs = performance.now() - t0;

    if (decision.action === 'execute') {
      routerLats.push(routerMs);
      const tools = decision.candidates.flatMap((x) => x.tool ? [x.tool] : []);
      const forbidden = tools.some((t) => c.forbidden.includes(t));
      const hasExpected = c.expectedAny.length > 0 && tools.some((t) => c.expectedAny.includes(t));
      const reasons: string[] = [];
      if (forbidden) reasons.push(`called forbidden tool`);
      if (!hasExpected && c.expectedAny.length > 0) {
        reasons.push(`expected ${c.expectedAny.join('/')}, got ${tools.join('/')}`);
      }
      const pass = !forbidden && (c.expectedAny.length === 0 ? tools.length === 0 : hasExpected);
      rows.push({
        id: c.id,
        category: c.category,
        lang: c.lang,
        question: c.question,
        handledBy: 'router',
        tools,
        pass,
        reasons,
        ms: routerMs,
      });
    } else if (decision.action === 'model' && decision.candidates.length > 0 && !decision.evidence.includes('possible-injection')) {
      const callT0 = performance.now();
      const r = await chat(
        base,
        model,
        [
          { role: 'system', content: STATIC_SYSTEM_V4 },
          { role: 'user', content: c.question },
        ],
        { tools: modelToolSpecs(), maxTokens: 200, temperature: 0.2 },
      );
      const totalMs = performance.now() - callT0;
      modelLats.push(totalMs);
      const score = scoreToolCase(c, r.toolCalls);
      rows.push({
        id: c.id,
        category: c.category,
        lang: c.lang,
        question: c.question,
        handledBy: 'model',
        tools: r.toolCalls.map((t) => t.name),
        pass: score.pass,
        reasons: score.reasons,
        ms: totalMs,
      });
    } else {
      // Clarify action
      const isExpectedNone = c.expectedAny.length === 0;
      rows.push({
        id: c.id,
        category: c.category,
        lang: c.lang,
        question: c.question,
        handledBy: 'clarify',
        tools: [],
        pass: isExpectedNone,
        reasons: isExpectedNone ? [] : ['router requested clarification when tool was expected'],
        ms: routerMs,
      });
    }
    process.stdout.write(`\rProgress: ${i + 1}/${cases.length} (${rows.filter((r) => r.pass).length} passed)   `);
  }

  const passed = rows.filter((r) => r.pass).length;
  const routerCount = rows.filter((r) => r.handledBy === 'router').length;
  const modelCount = rows.filter((r) => r.handledBy === 'model').length;
  const clarifyCount = rows.filter((r) => r.handledBy === 'clarify').length;

  const median = (arr: number[]) => {
    if (!arr.length) return 0;
    const s = [...arr].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
  };

  const accuracy = (passed / cases.length) * 100;
  const routerCoverage = (routerCount / cases.length) * 100;
  const routerPassed = rows.filter((r) => r.handledBy === 'router' && r.pass).length;
  const modelPassed = rows.filter((r) => r.handledBy === 'model' && r.pass).length;

  console.log('\n\n================ RESULTS ================');
  console.log(`Total Cases:              ${cases.length}`);
  console.log(`Direct Router Executions: ${routerCount}/${cases.length} (${routerCoverage.toFixed(1)}%)`);
  console.log(`Router Execution Accuracy: ${routerPassed}/${routerCount} (${((routerPassed / routerCount) * 100).toFixed(1)}%)`);
  console.log(`Router Median Latency:    ${median(routerLats).toFixed(3)} ms`);
  console.log(`Model Fallbacks:          ${modelCount}/${cases.length} (${((modelCount / cases.length) * 100).toFixed(1)}%)`);
  console.log(`Model Accuracy:           ${modelPassed}/${modelCount} (${((modelPassed / modelCount) * 100).toFixed(1)}%)`);
  console.log(`Model Median Latency:     ${median(modelLats).toFixed(1)} ms`);
  console.log(`Clarifications:           ${clarifyCount}`);
  console.log(`-----------------------------------------`);
  console.log(`COMBINED HYBRID ACCURACY: ${passed}/${cases.length} (${accuracy.toFixed(1)}%)`);
  console.log('=========================================\n');

  const failing = rows.filter((r) => !r.pass);
  if (failing.length > 0) {
    console.log('Failing cases:');
    for (const f of failing) {
      console.log(`- [${f.id}] (${f.handledBy}) "${f.question}": ${f.reasons.join('; ')}`);
    }
  }

  const resultsDir = new URL('./results/', import.meta.url);
  mkdirSync(fileURLToPath(resultsDir), { recursive: true });
  const outFile = new URL(`./results/hybrid-${new Date().toISOString().replace(/[:.]/g, '-')}.json`, import.meta.url);
  writeFileSync(
    fileURLToPath(outFile),
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        model,
        total: cases.length,
        passed,
        accuracy: accuracy / 100,
        router: {
          count: routerCount,
          passed: routerPassed,
          coverage: routerCoverage / 100,
          medianMs: median(routerLats),
        },
        modelFallback: {
          count: modelCount,
          passed: modelPassed,
          accuracy: modelPassed / modelCount,
          medianMs: median(modelLats),
        },
        rows,
      },
      null,
      2,
    ),
  );
  console.log(`\nDetailed report saved: ${fileURLToPath(outFile)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
