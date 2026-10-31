/**
 * Model-tier benchmark through Ollama (llama.cpp): the RoLlama router on stratified questions of the stress set.
 *   ollama create rollama -f Modelfile      (FROM the GGUF, TEMPLATE "{{ .Prompt }}", num_ctx 2048, temperature 0)
 *   MODEL=rollama N=14 npx tsx scripts/bench-model-ollama.mts
 * It sends the app's exact router prompt (src/llm/rollama.ts) and reports, separately: JSON valid, tool inside the allow-list, tool correct,
 * and the confusion by expected tool. Ollama is not the phone: speeds here are the laptop's, accuracy is the GGUF's.
 * N is the number of questions per expected tool (7 tools).
 */
import { readFileSync } from 'node:fs';
import { buildRouterPrompt, normalizePassengerQuery, parseRouterJson } from '../src/llm/rollama';

type Sample = { id: number; query: string; expected_tool: string };
const all = JSON.parse(readFileSync(new URL('../eval/stress_1000.json', import.meta.url), 'utf8')) as Sample[];
const model = process.env.MODEL ?? 'rollama';
const base = process.env.OLLAMA_URL ?? 'http://127.0.0.1:11434';
const perTool = Number(process.env.N ?? 14);

const byTool = new Map<string, Sample[]>();
for (const s of all) byTool.set(s.expected_tool, [...(byTool.get(s.expected_tool) ?? []), s]);
const sample: Sample[] = [];
for (const [, list] of byTool) {
  const step = Math.max(1, Math.floor(list.length / perTool));
  for (let i = 0; i < list.length && sample.length < 10_000 && i / step < perTool; i += step) sample.push(list[i]);
}

let valid = 0, correct = 0;
const confusion: Record<string, Record<string, number>> = {};
const wrong: string[] = [];
const times: number[] = [];
for (const s of sample) {
  const prompt = buildRouterPrompt(normalizePassengerQuery(s.query));
  const t0 = performance.now();
  const r = (await fetch(`${base}/api/generate`, { method: 'POST', body: JSON.stringify({ model, raw: true, stream: false, prompt, options: { temperature: 0, num_predict: 48, repeat_penalty: 1.1, num_ctx: 2048 } }) }).then((x) => x.json())) as { response?: string };
  times.push(performance.now() - t0);
  const call = parseRouterJson(r.response ?? '');
  const got = call?.name ?? 'INVALID';
  if (call) valid++;
  if (got === s.expected_tool) correct++;
  else if (wrong.length < 12) wrong.push(`expected ${s.expected_tool}, got ${got}${call ? '' : ` (${JSON.stringify((r.response ?? '').slice(0, 50))})`}: ${s.query}`);
  (confusion[s.expected_tool] ??= {})[got] = (confusion[s.expected_tool][got] ?? 0) + 1;
}
times.sort((a, b) => a - b);
console.log(JSON.stringify({ model, questions: sample.length, json_valid: valid, tool_correct: correct, accuracy_pct: +((100 * correct) / sample.length).toFixed(1), median_ms: Math.round(times[Math.floor(times.length / 2)]), confusion }, null, 1));
console.log('\nwrong (first 12):\n' + wrong.join('\n'));
