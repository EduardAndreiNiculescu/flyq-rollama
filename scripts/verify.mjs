// One command that checks what can be reproduced from a fresh clone, with timings and a JSON report.
//   npm ci --ignore-scripts      (on Windows; see docs/REPRODUCE.md)  then:  node scripts/verify.mjs
// It runs: typecheck, the test suite, and the deterministic-layer benchmark (no model, no network, no keys).
// It does NOT build the iOS app and does NOT run the AI model: those need a Mac / the GGUF (docs/REPRODUCE.md says how).
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { platform, arch, cpus, totalmem } from 'node:os';

const steps = [
  { name: 'typecheck', cmd: 'npm', args: ['run', 'typecheck'] },
  { name: 'tests', cmd: 'npm', args: ['test'] },
  { name: 'deterministic benchmark (1000 questions)', cmd: 'npx', args: ['tsx', 'scripts/bench-tier1.ts', '--json', 'verify-bench.json'] },
];

const results = [];
for (const s of steps) {
  const t0 = performance.now();
  const r = spawnSync(s.cmd, s.args, { encoding: 'utf8', shell: process.platform === 'win32' });
  const sec = +((performance.now() - t0) / 1000).toFixed(1);
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  const tests = /Tests\s+(.+)/.exec(out)?.[1]?.trim();
  results.push({ step: s.name, ok: r.status === 0, seconds: sec, detail: tests ?? '' });
  console.log(`${r.status === 0 ? 'PASS' : 'FAIL'}  ${s.name}  ${sec}s${tests ? `  (${tests})` : ''}`);
  if (r.status !== 0) console.log(out.split('\n').slice(-25).join('\n'));
}

const report = {
  date: new Date().toISOString(),
  environment: { node: process.version, platform: platform(), arch: arch(), cpu: cpus()[0]?.model, cores: cpus().length, ramGB: +(totalmem() / 2 ** 30).toFixed(1) },
  results,
  total_seconds: +results.reduce((a, b) => a + b.seconds, 0).toFixed(1),
  not_covered: ['iOS build (needs a Mac, Xcode, an Apple developer account)', 'RoLlama model accuracy and latency (needs the GGUF on a device)', 'FlyQ backend (needs a FlyQ app key)'],
};
writeFileSync('verify-report.json', JSON.stringify(report, null, 2));
console.log(`\ntotal ${report.total_seconds}s, report: verify-report.json`);
process.exit(results.every((r) => r.ok) ? 0 : 1);
