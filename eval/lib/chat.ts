/**
 * Chat client for desktop evaluation. Two backends, chosen with FF_BACKEND:
 *  - 'openai' (default): OpenAI-compatible /chat/completions (finetune/chat_server.py, llama-server, ...).
 *  - 'ollama-raw': Ollama /api/generate with raw:true and a prompt rendered exactly like the official Qwen3
 *    template with enable_thinking=False (eval/lib/qwen-template.ts). Needed because Ollama's chat endpoint
 *    either lets Qwen3 think or leaks its reasoning into the answer. Base URL has no /v1 suffix here.
 */
import { parseToolCalls, renderQwen3, type TplMessage } from './qwen-template';
export type Msg = { role: string; content?: string; tool_calls?: unknown; tool_call_id?: string };
export type ChatResult = { text: string; toolCalls: { name: string; arguments: string }[]; ms: number };

async function chatOllamaRaw(
  base: string,
  model: string,
  messages: Msg[],
  opts: { tools?: unknown[]; maxTokens?: number; temperature?: number },
): Promise<ChatResult> {
  const t0 = Date.now();
  const res = await fetch(`${base.replace(/\/v1\/?$/, '')}/api/generate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model,
      prompt: renderQwen3(messages as TplMessage[], opts.tools),
      raw: true,
      stream: false,
      options: { temperature: opts.temperature ?? 0.7, top_p: 0.8, top_k: 20, num_predict: opts.maxTokens ?? 300, num_ctx: 4096, stop: ['<|im_end|>'] },
    }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const j = (await res.json()) as { response?: string };
  const parsed = parseToolCalls(String(j.response ?? ''));
  return { text: parsed.content, toolCalls: parsed.toolCalls, ms: Date.now() - t0 };
}

export async function chat(
  base: string,
  model: string,
  messages: Msg[],
  opts: { tools?: unknown[]; maxTokens?: number; temperature?: number } = {},
): Promise<ChatResult> {
  if (process.env.FF_BACKEND === 'ollama-raw') return chatOllamaRaw(base, model, messages, opts);
  const t0 = Date.now();
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model,
      messages,
      temperature: opts.temperature ?? 0.7,
      top_p: 0.8,
      max_tokens: opts.maxTokens ?? 300,
      stream: false,
      ...(opts.tools ? { tools: opts.tools } : {}),
    }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const j = (await res.json()) as { choices: { message: { content?: string | null; tool_calls?: { function: { name: string; arguments: string } }[] } }[] };
  const m = j.choices[0].message;
  return {
    text: String(m.content ?? '').replace(/<think>[\s\S]*?<\/think>/g, '').trim(),
    toolCalls: (m.tool_calls ?? []).map((c) => ({ name: c.function.name, arguments: c.function.arguments })),
    ms: Date.now() - t0,
  };
}
