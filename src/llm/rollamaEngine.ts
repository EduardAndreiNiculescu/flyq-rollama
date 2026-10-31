import type { ChatMessage, EngineToolCall, GenerateStats, LlmEngine } from '../core/assistant';
import { answerFromTool, buildRouterPrompt, noneReply, normalizePassengerQuery, parseRouterJson, ROLLAMA_GRAMMAR } from './rollama';

/** Words that justify the tracking tool (the training pipeline's list, plus the English ones). */
export const LIVE_ASKED = /(unde|pozitie|radar|aeronava|avion|in aer|altitudine|harta|zbor|live|urmareste|where|position|altitude|tracking|track|map|how high|how fast|viteza)/;

/** What the engine needs from llama.rn: one raw completion. LlamaEngine implements it; tests pass a fake. */
export interface RawCompleter {
  completeRaw(prompt: string, opts?: { maxTokens?: number; grammar?: string }): Promise<{ text: string; stats: GenerateStats }>;
  stop(): Promise<void>;
}

const ZERO: GenerateStats = { timeToFirstTokenMs: 0, tokensPerSecond: null, totalMs: 0, tokens: 0 };

/**
 * LlmEngine over the RoLlama router, so the same tool loop (sanitizer, fast path, composer, guard, timing) drives it.
 *  - first call of a turn: the model picks the tool as JSON (or `none`); it never writes text;
 *  - call after a tool ran: the answer is built from the tool result by code (answerFromTool), so no second model call.
 */
export class RollamaEngine implements LlmEngine {
  constructor(private raw: RawCompleter) {}

  async generate(messages: ChatMessage[], _onToken: (partial: string) => void): Promise<{ text: string; stats: GenerateStats; toolCalls?: EngineToolCall[] }> {
    const question = [...messages].reverse().find((m) => m.role === 'user')?.content ?? '';
    const last = messages[messages.length - 1];
    if (last?.role === 'tool') {
      const asked = [...messages].reverse().find((m) => m.role === 'assistant' && m.tool_calls?.length);
      const tool = asked?.tool_calls?.[0].function.name ?? '';
      return { text: answerFromTool(tool, last.content, question), stats: ZERO, toolCalls: [] };
    }
    const r = await this.raw.completeRaw(buildRouterPrompt(normalizePassengerQuery(question)), { grammar: ROLLAMA_GRAMMAR });
    const call = parseRouterJson(r.text);
    if (!call || call.name === 'none') return { text: noneReply(question), stats: r.stats, toolCalls: [] };
    // Live position only when the passenger asked about position; a curiosity-driven router guess never runs the tracking tool.
    if (call.name === 'get_live_tracking' && !LIVE_ASKED.test(question.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''))) {
      return { text: noneReply(question), stats: r.stats, toolCalls: [] };
    }
    return { text: '', stats: r.stats, toolCalls: [{ id: 'rollama_1', name: call.name, arguments: JSON.stringify(call.arguments) }] };
  }

  stop() {
    return this.raw.stop();
  }
}
