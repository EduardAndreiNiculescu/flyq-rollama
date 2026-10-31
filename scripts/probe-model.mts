// Debug: the raw text the RoLlama router writes for given questions, through Ollama (llama.cpp).
//   MODEL=rollama-v2 npx tsx scripts/probe-model.mts "am voie cu lichide" "ce poarta am?"
// Shows the exact string (JSON.stringify keeps leading spaces and newlines visible), the parsed decision, and the first tokens' look.
import { buildRouterPrompt, normalizePassengerQuery, parseRouterJson } from '../src/llm/rollama';

const model = process.env.MODEL ?? 'rollama-v2';
const base = process.env.OLLAMA_URL ?? 'http://127.0.0.1:11434';
const qs = process.argv.length > 2 ? process.argv.slice(2) : ['Ce loc am?', 'La ce oră e îmbarcarea?', 'Cât durează securitatea?', 'am voie cu lichide', 'Ce poartă am?', 'La ce oră decolăm?', 'Unde e toaleta?', 'salut'];
for (const q of qs) {
  const prompt = buildRouterPrompt(normalizePassengerQuery(q));
  const r = (await fetch(`${base}/api/generate`, { method: 'POST', body: JSON.stringify({ model, raw: true, stream: false, prompt, options: { temperature: 0, num_predict: 48, repeat_penalty: 1.1, num_ctx: 2048 } }) }).then((x) => x.json())) as { response?: string; eval_count?: number };
  console.log(JSON.stringify({ q, raw: r.response, tokens: r.eval_count, parsed: parseRouterJson(r.response ?? '')?.name ?? 'INVALID' }));
}
