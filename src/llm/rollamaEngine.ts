import { INJECTION, normalize } from '../core/router';
import type { ChatMessage, EngineToolCall, GenerateStats, LlmEngine } from '../core/assistant';
import { answerFromTool, buildRouterPrompt, noneReply, normalizePassengerQuery, parseRouterJson, plain, ROLLAMA_GRAMMAR, unsureReply } from './rollama';

/** Words that justify the tracking tool (the training pipeline's list, plus the English ones). */
export const LIVE_ASKED = /(unde|pozitie|radar|aeronava|avion|in aer|altitudine|harta|zbor|live|urmareste|where|position|altitude|tracking|track|map|how high|how fast|viteza)/;
/** Words that ask for flight facts (times, status). Without them a "flight details" guess is more likely a rules question (boarding, security). */
const FLIGHT_CUES = /(decol|ateriz|plec|sosi|ajung|intarzi|la timp|zbor|durata|flight|depart|arriv|land|delay|late|on time)/;

/** What the engine needs from llama.rn: one raw completion. LlamaEngine implements it; tests pass a fake. */
export interface RawCompleter {
  completeRaw(prompt: string, opts?: { maxTokens?: number; grammar?: string }): Promise<{ text: string; stats: GenerateStats }>;
  stop(): Promise<void>;
}

const ZERO: GenerateStats = { timeToFirstTokenMs: 0, tokensPerSecond: null, totalMs: 0, tokens: 0 };

/**
 * TEMPORARY while the on-device routing is being debugged: refusals carry the model's raw JSON, and every router call is written to the
 * native console (console.error reaches NSLog in release builds). Set to false before shipping.
 */
export const ROUTER_DEBUG = true;
const devNote = (raw: string, decision: string) => (ROUTER_DEBUG ? ` [dev: ${raw.slice(0, 70)} => ${decision}]` : '');

/**
 * LlmEngine over the RoLlama router, so the same tool loop (sanitizer, fast path, composer, guard, timing) drives it.
 *  - first call of a turn: the model picks the tool as JSON (or `none`); it never writes text. When the deterministic router already
 *    narrowed the candidates (`opts.tools`), the model chooses among them: a tool outside that list is replaced, not trusted;
 *  - call after a tool ran: the answer is built from the tool result by code (answerFromTool), so no second model call.
 */
export class RollamaEngine implements LlmEngine {
  /** For the dev line under each answer: what the model wrote and what the engine did with it. */
  lastRaw = '';
  lastDecision = '';

  constructor(private raw: RawCompleter) {}

  async generate(messages: ChatMessage[], _onToken: (partial: string) => void, opts?: { tools?: unknown[] }): Promise<{ text: string; stats: GenerateStats; toolCalls?: EngineToolCall[] }> {
    const question = [...messages].reverse().find((m) => m.role === 'user')?.content ?? '';
    const last = messages[messages.length - 1];
    if (last?.role === 'tool') {
      const asked = [...messages].reverse().find((m) => m.role === 'assistant' && m.tool_calls?.length);
      const tool = asked?.tool_calls?.[0].function.name ?? '';
      return { text: answerFromTool(tool, last.content, question), stats: ZERO, toolCalls: [] };
    }
    const r = await this.raw.completeRaw(buildRouterPrompt(normalizePassengerQuery(question)), { grammar: ROLLAMA_GRAMMAR });
    const call = parseRouterJson(r.text);
    this.lastRaw = r.text;
    const allowed = (opts?.tools ?? []).map((t) => (t as { function?: { name?: string } }).function?.name).filter((n): n is string => !!n);
    const q = plain(question);
    const cues = FLIGHT_CUES.test(q);

    const modelSaidNone = !!call && call.name === 'none';
    let name: string | null = call && !modelSaidNone ? call.name : null;
    let why = !call ? 'json-invalid' : modelSaidNone ? 'none' : `tool:${call.name}`;
    if (name) {
      if (allowed.length && !allowed.includes(name)) {
        const pick = allowed.includes('search_knowledge') && !cues ? 'search_knowledge' : allowed[0];
        why += `->${pick}(router)`;
        name = pick;
      } else if (name === 'get_flight_details' && allowed.includes('search_knowledge') && !cues) {
        why += '->search_knowledge';
        name = 'search_knowledge';
      }
      // Live position only when the passenger asked about position; a curiosity-driven router guess never runs the tracking tool.
      if (name === 'get_live_tracking' && !LIVE_ASKED.test(q)) {
        why = 'blocked:live-tracking-not-asked';
        name = null;
      }
    }
    // A "none" from a 1B model is a guess, not a verdict: when the deterministic router found a plausible tool and nothing looks like a
    // steering attempt, run that tool instead of refusing.
    const steering = INJECTION.test(normalize(question));
    const greeting = /^(?:salut|buna|hei|hey|hello|hi|noroc|servus|good)\b/.test(q.trim());
    if (!name && modelSaidNone && allowed.length && !steering && !greeting) {
      name = allowed[0];
      why += `->${name}(router-overrides-none)`;
    }
    this.lastDecision = why;
    if (ROUTER_DEBUG) console.error(`[RL] q=${JSON.stringify(question)} raw=${JSON.stringify(r.text)} decision=${why} allowed=${allowed.join(',')} tokens=${r.stats.tokens}`);
    if (!name) {
      // The hard refusal is for greetings and steering attempts (and what the deterministic boundary already caught before the model).
      // Everything else the model gave up on gets the helpful pointer, not "I can't do that".
      return { text: (modelSaidNone && (greeting || steering) ? noneReply(question) : unsureReply(question)) + devNote(r.text, why), stats: r.stats, toolCalls: [] };
    }
    const args = call && name === call.name ? call.arguments : {};
    return { text: '', stats: r.stats, toolCalls: [{ id: 'rollama_1', name, arguments: JSON.stringify(args) }] };
  }

  stop() {
    return this.raw.stop();
  }
}
