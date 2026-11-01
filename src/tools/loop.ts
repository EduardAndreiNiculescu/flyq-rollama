import type { ChatMessage, GenerateStats, LlmEngine } from '../core/assistant';
import { routeDecision } from '../core/router';
import { capabilityBoundaryReply } from '../core/capability';
import { urgentSafetyAnswer } from '../core/emergency';
import { composeAnswer } from './composer';
import { tryFastPath } from './fastPath';
import { createTools, executeToolCall, toolSpecs, type ToolDef, type ToolDeps, type ToolResult, type ToolSpec } from './registry';
import { sanitizeToolCall } from './sanitizer';
import { composePlaceAnswer, findPlaces } from '../core/places';
import { isRomanian } from '../llm/rollama';

export type ToolTrace = { name: string; args: string; ok: boolean; sideEffect: boolean };
export type ToolTiming = { toolMs: number; modelMs: Array<{ totalMs: number; firstTokenMs: number | null; decodeMs: number | null }> };

export type ToolLoopResult = { text: string; stats: GenerateStats; trace: ToolTrace[]; timing: ToolTiming; stoppedByLimit: boolean; /** 'fast' = no model call; 'composed' = no second model call */ path: 'fast' | 'composed' | 'model'; /** the whole conversation incl. tool results, for the answer guard */ messages: ChatMessage[] };

/**
 * Let the model request tools, run them under app control, feed results back, repeat.
 * Limits: maxSteps model calls, maxCallsPerStep tool calls per step. The final step is forced
 * without tools so the loop always ends with text. Tool output is wrapped as data.
 */
export async function runToolLoop(
  engine: LlmEngine,
  messages: ChatMessage[],
  deps: ToolDeps,
  onToken: (partial: string) => void,
  opts: { tools?: ToolDef[]; /** What the model is shown (default: the registry's own specs). The V4 contract shows a compact view. */ specs?: ToolSpec[]; maxSteps?: number; maxCallsPerStep?: number; maxTokens?: number; allowSideEffects?: boolean; /** Build clear-cut flight answers from the tool result instead of a second model call (default on) */ compose?: boolean; /** Skip the model for a small allowlist of plain flight questions (default off) */ fastPath?: boolean; /** Answer "where is X" from the place catalogue (default on) */ places?: boolean; /** Limit the first model step to deterministic router candidates (default off). */ intentRouting?: boolean; nowMs?: () => number; onTool?: (e: { name: string; phase: 'start' | 'done'; ok?: boolean }) => void } = {},
): Promise<ToolLoopResult> {
  const tools = opts.tools ?? createTools();
  const specs = opts.specs ?? toolSpecs(tools);
  const maxSteps = opts.maxSteps ?? 3;
  const maxCalls = opts.maxCallsPerStep ?? 3;
  const convo = [...messages];
  const trace: ToolTrace[] = [];
  const timing: ToolTiming = { toolMs: 0, modelMs: [] };
  const nowMs = opts.nowMs ?? performance.now.bind(performance);
  const question = [...messages].reverse().find((m) => m.role === 'user')?.content ?? '';
  const decision = opts.intentRouting ? routeDecision(question, { flightNumber: deps.context.flightNumber }) : null;
  const candidateNames = new Set(decision?.candidates.map(c => c.tool).filter((x): x is NonNullable<typeof x> => !!x) ?? []);
  // An evaluated router decision always constrains the first model call. An
  // empty candidate list is intentional: unknown or steered input must not see
  // the complete tool surface merely because Tier 1 could not classify it.
  const routedSpecs = decision ? specs.filter(s => candidateNames.has(s.function.name as never)) : undefined;
  const emergency = urgentSafetyAnswer(question);
  if (emergency) {
    convo.push({ role: 'assistant', content: emergency });
    return { text: emergency, stats: { timeToFirstTokenMs: null, tokensPerSecond: null, totalMs: 0, tokens: 0 }, trace, timing, stoppedByLimit: false, messages: convo, path: 'fast' };
  }
  if (decision?.evidence.includes('unsupported-capability') || decision?.evidence.includes('out-of-scope')) {
    const text = capabilityBoundaryReply(question);
    convo.push({ role: 'assistant', content: text });
    return { text, stats: { timeToFirstTokenMs: null, tokensPerSecond: null, totalMs: 0, tokens: 0 }, trace, timing, stoppedByLimit: false, messages: convo, path: 'fast' };
  }
  // "Unde e toaleta / unde găsesc bancomatul / unde e barul lui Coco": answered from the place catalogue (src/core/places.ts), no model and no fine-tuning.
  // The map opens on the place when the app has one; the answer says "I opened the map" only when it really did.
  if (opts.places !== false) {
    const pq = findPlaces(question);
    if (pq) {
      const lang = isRomanian(question) ? 'ro' : 'en';
      let answer = composePlaceAnswer(pq, lang, question, false);
      let opened = false;
      if (answer.open && deps.nav && opts.allowSideEffects === true) {
        opts.onTool?.({ name: 'find_place', phase: 'start' });
        try {
          opened = (await deps.nav.openAirportMap({ destination: answer.open.destination, nodeId: answer.open.nodeId, fromZone: deps.context.currentZone })) !== false;
        } catch {
          opened = false;
        }
        opts.onTool?.({ name: 'find_place', phase: 'done', ok: opened });
        if (opened) answer = composePlaceAnswer(pq, lang, question, true);
      }
      convo.push({ role: 'assistant', content: answer.text });
      return { text: answer.text, stats: { timeToFirstTokenMs: null, tokensPerSecond: null, totalMs: 0, tokens: 0 }, trace: [{ name: 'find_place', args: JSON.stringify({ places: pq.places.map(p => p.id), gate: pq.gate ?? null, opened }), ok: true, sideEffect: opened }], timing, stoppedByLimit: false, messages: convo, path: 'fast' };
    }
  }
  if (opts.fastPath && opts.compose !== false) {
    const fast = await tryFastPath(question, tools, deps, opts.onTool, nowMs, ms => { timing.toolMs += ms; });
    if (fast) {
      convo.push({ role: 'assistant', content: '', tool_calls: [{ id: 'fast_0', type: 'function', function: { name: fast.name, arguments: '{}' } }] });
      convo.push({ role: 'tool', tool_call_id: 'fast_0', content: JSON.stringify({ result: fast.data }) });
      convo.push({ role: 'assistant', content: fast.text });
      return { text: fast.text, stats: { timeToFirstTokenMs: null, tokensPerSecond: null, totalMs: 0, tokens: 0 }, trace: [{ name: fast.name, args: '{}', ok: true, sideEffect: false }], timing, stoppedByLimit: false, messages: convo, path: 'fast' };
    }
  }

  for (let step = 1; step <= maxSteps; step++) {
    const last = step === maxSteps;
    const modelStart = nowMs();
    let firstToken: number | null = null;
    const modelSpecs = last ? undefined : opts.intentRouting && step === 1 ? routedSpecs : specs;
    // "Unde e toaleta?": the router already has the tool and the place (score 0.98), so the model is not asked to repeat them (a 1B model
    // often drops the destination, and the map then refuses). The tool call still goes through the sanitizer and the normal loop.
    const only = decision?.candidates.length === 1 ? decision.candidates[0] : null;
    const direct = step === 1 && !last && opts.allowSideEffects && decision?.action === 'execute' && only?.tool === 'open_airport_map' && only.args.destination ? only : null;
    const res = direct
      ? { text: '', stats: { timeToFirstTokenMs: null, tokensPerSecond: null, totalMs: 0, tokens: 0 } as GenerateStats, toolCalls: [{ id: 'direct_1', name: 'open_airport_map', arguments: JSON.stringify({ destination: direct.args.destination }) }] }
      : await engine.generate(convo, (partial) => {
          if (firstToken === null) firstToken = nowMs();
          onToken(partial);
        }, { maxTokens: opts.maxTokens, tools: modelSpecs });
    const modelEnd = nowMs();
    timing.modelMs.push({ totalMs: modelEnd - modelStart, firstTokenMs: firstToken === null ? null : firstToken - modelStart, decodeMs: firstToken === null ? null : modelEnd - firstToken });
    const calls = (res.toolCalls ?? []).slice(0, maxCalls);
    if (calls.length === 0 || last) return { text: res.text, stats: res.stats, trace, timing, stoppedByLimit: last && calls.length > 0, messages: convo, path: 'model' };

    convo.push({
      role: 'assistant',
      content: res.text,
      tool_calls: calls.map((c, i) => ({ id: c.id ?? `call_${step}_${i}`, type: 'function', function: { name: c.name, arguments: c.arguments } })),
    });
    const ran: Array<{ name: string; ok: boolean; data: unknown }> = [];
    for (const [i, c] of calls.entries()) {
      let parsedArgs: Record<string, string> = {};
      try {
        parsedArgs = typeof c.arguments === 'string' && c.arguments.trim() ? JSON.parse(c.arguments) : {};
      } catch {
        parsedArgs = {};
      }
      const sanitized = sanitizeToolCall(c.name, parsedArgs, question, deps.context);
      const effectiveName = sanitized.name;
      const effectiveArgs = JSON.stringify(sanitized.arguments);

      const def = tools.find((t) => t.name === effectiveName);
      const blocked = (def?.sideEffect && opts.allowSideEffects !== true) || sanitized.action === 'block';
      opts.onTool?.({ name: effectiveName, phase: 'start' });
      const toolStart = nowMs();
      let result: ToolResult;
      if (blocked) {
        result = { ok: false, error: 'this action is not allowed right now' };
      } else if (sanitized.action === 'clarify') {
        result = { ok: false, error: sanitized.reason ?? 'clarification required' };
      } else {
        result = await executeToolCall(tools, effectiveName, effectiveArgs, deps);
      }
      timing.toolMs += nowMs() - toolStart;
      opts.onTool?.({ name: effectiveName, phase: 'done', ok: result.ok });
      ran.push({ name: effectiveName, ok: result.ok, data: result.ok ? result.data : null });
      trace.push({ name: effectiveName, args: effectiveArgs.slice(0, 200), ok: result.ok, sideEffect: !!def?.sideEffect });
      convo.push({
        role: 'tool',
        tool_call_id: c.id ?? `call_${step}_${i}`,
        content: JSON.stringify(result.ok ? { result: result.data } : { error: result.error }),
      });
    }
    if (opts.compose !== false) {
      let composed = composeAnswer(question, ran, deps.now());
      // The model chose the right tool for a question worded in a way the composer does not recognise ("La care usa ma prezint?", "Mai e mult pana ma urc?"):
      // the answer is still the tool's result, composed as for the plain question, instead of "I have no safe wording".
      if (!composed && ran.length === 1 && ran[0]!.ok) {
        const plain = ran[0]!.name === 'get_gate' ? 'ce poarta am' : ran[0]!.name === 'get_time_remaining' ? 'cat mai e pana decolam' : null;
        if (plain) composed = composeAnswer(plain, ran, deps.now());
      }
      if (composed) {
        convo.push({ role: 'assistant', content: composed });
        return { text: composed, stats: res.stats, trace, timing, stoppedByLimit: false, messages: convo, path: 'composed' };
      }
    }
  }
  return { text: '', stats: { timeToFirstTokenMs: null, tokensPerSecond: null, totalMs: 0, tokens: 0 }, trace, timing, stoppedByLimit: true, messages: convo, path: 'model' };
}
