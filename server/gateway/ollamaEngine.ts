import type { ChatMessage, EngineToolCall, GenerateStats, LlmEngine } from '../../src/core/assistant';
import { parseToolCalls, renderQwen3, type TplMessage } from '../../src/llm/qwenTemplate';

/**
 * Desktop engine for the gateway: Ollama /api/generate with a raw prompt rendered like the official Qwen3 template
 * (thinking off). For TESTING tool-calling against live data; the phone uses llama.rn, not this.
 */
export class OllamaEngine implements LlmEngine {
  constructor(private o: { baseUrl: string; model: string; fetchImpl?: typeof fetch; numCtx?: number; temperature?: number; presencePenalty?: number }) {}

  async describe() {
    const res = await (this.o.fetchImpl ?? fetch)(`${this.o.baseUrl.replace(/\/$/, '')}/api/show`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model: this.o.model }),
    });
    if (!res.ok) throw new Error(`model server HTTP ${res.status}`);
    const data = (await res.json()) as { model_info?: Record<string, unknown> };
    const info = data.model_info ?? {};
    return {
      name: this.o.model, architecture: info['general.architecture'] ?? null,
      blocks: info['qwen3.block_count'] ?? null, parameters: info['general.parameter_count'] ?? null,
      trainedContext: info['qwen3.context_length'] ?? null, runtimeContext: this.o.numCtx ?? 4096,
      temperature: this.o.temperature ?? 0.2, thinking: false,
      note: 'Numărul de layere este metadată GGUF; activările interne nu sunt expuse.',
    };
  }

  async generate(
    messages: ChatMessage[],
    onToken: (partial: string) => void,
    opts?: { maxTokens?: number; tools?: unknown[] },
  ): Promise<{ text: string; stats: GenerateStats; toolCalls?: EngineToolCall[] }> {
    const t0 = Date.now();
    const res = await (this.o.fetchImpl ?? fetch)(`${this.o.baseUrl.replace(/\/$/, '')}/api/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: this.o.model,
        prompt: renderQwen3(messages as TplMessage[], opts?.tools),
        raw: true,
        stream: false,
        options: { temperature: this.o.temperature ?? 0.2, top_p: 0.8, top_k: 20, presence_penalty: this.o.presencePenalty ?? 0, num_predict: opts?.maxTokens ?? 300, num_ctx: this.o.numCtx ?? 4096, stop: ['<|im_end|>'] },
      }),
    });
    if (!res.ok) throw new Error(`model server HTTP ${res.status}`);
    const j = (await res.json()) as { response?: string; eval_count?: number; eval_duration?: number };
    const parsed = parseToolCalls(String(j.response ?? ''));
    onToken(parsed.content);
    const totalMs = Date.now() - t0;
    return {
      text: parsed.content,
      toolCalls: parsed.toolCalls.map((c) => ({ name: c.name, arguments: c.arguments })),
      stats: {
        timeToFirstTokenMs: null,
        tokensPerSecond: j.eval_count && j.eval_duration ? (j.eval_count / j.eval_duration) * 1e9 : null,
        totalMs,
        tokens: j.eval_count ?? 0,
      },
    };
  }

  async stop() {}
}
