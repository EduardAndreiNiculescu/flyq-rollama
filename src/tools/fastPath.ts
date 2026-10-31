import { tier1FastTool } from '../core/tier1';
import { answerFromTool, normalizePassengerQuery } from '../llm/rollama';
import { composeAnswer } from './composer';
import { executeToolCall, type ToolDef, type ToolDeps } from './registry';

const plain = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[?!.,]+$/g, '').replace(/\s+/g, ' ').trim();
const UNSAFE = /\b(nu|fara|nici|not|no|without|ignore|ignora|instruc|instructions|prompt|system|sistem|spune|tell|pretend|reguli|rules)\b/;
const LEAD = /^(?:ba|ma|bai|frate|nene|na|ia zi|ok deci|hey|quick|dude|bro|yo)[, ]+/;
const TAIL = /[, ]+(?:ma|ba|frate|pe bune|sincer|mersi|pls|asap|thanks|bro|man|lol)$/;

export function toolFor(question: string): string | null {
  const raw = plain(question);
  if (raw.length > 100 || UNSAFE.test(raw)) return null;
  const q = raw.replace(LEAD, '').replace(TAIL, '');
  if (/^(?:care e poarta mea|ce poarta am|la ce poarta (?:merg|sunt|trebuie sa (?:merg|ajung))|pe ce poarta imbarc|unde imbarc|unde este poarta mea|care este poarta de imbarcare|which gate am i at|what is my boarding gate|where do i board|what gate am i|what is my gate|which gate is my flight)$/.test(q)) return 'get_gate';
  if (/^(?:la ce ora decolam|cand pleaca avionul|cand decolam|cand decoleaza avionul|cand pleaca zborul|la ce ora pleaca avionul|la ce ora e (?:decolarea|plecarea)|care e ora de plecare|what time does my flight (?:leave|depart)|when does my plane take off|what time is departure|what time do we (?:take off|leave))$/.test(q)) return 'get_flight_details';
  if (/^(?:cand aterizam|la ce ora aterizam|la ce ora e (?:sosirea|aterizarea)|cand ajunge zborul|la ce ora ajunge avionul meu|pe ce ora e sosirea|cand ajung la destinatie|when do we land|what time does my flight arrive|what is my arrival time|what time do we land|when does the plane land|when do we arrive)$/.test(q)) return 'get_flight_details';
  if (/^(?:cat mai e pana (?:decolam|aterizam)|in cat timp (?:decolam|aterizam|ajungem)|mai dureaza mult pana ajungem|cat timp mai avem de zbor|cat mai e de zbor|how long until we (?:land|depart)|how long until (?:landing|departure))$/.test(q)) return 'get_time_remaining';
  if (/^(?:cat dureaza zborul|cat timp dureaza zborul|cat este zborul|cat stau in avion|ce durata are zborul(?: asta)?|ce durata are drumul|how long is the flight|how long is my flight|how many hours will i be in the air|flight duration)$/.test(q)) return 'get_flight_details';
  return tier1FastTool(normalizePassengerQuery(question)); // rules ported from the benchmark pipeline (core/tier1.ts), after the exact-phrase ones above
}

export async function tryFastPath(question: string, tools: ToolDef[], deps: ToolDeps, onTool?: (e: { name: string; phase: 'start' | 'done'; ok?: boolean }) => void, nowMs: () => number = performance.now.bind(performance), onTiming?: (ms: number) => void): Promise<{ name: string; data: unknown; text: string } | null> {
  const name = toolFor(question);
  if (!name || !tools.some((t) => t.name === name && !t.sideEffect)) return null;
  if (name !== 'search_knowledge' && !deps.context.flightNumber) return null; // flight tools need a selected flight; the rules need none
  onTool?.({ name, phase: 'start' });
  const start = nowMs();
  const result = await executeToolCall(tools, name, name === 'search_knowledge' ? JSON.stringify({ query: question.slice(0, 200) }) : '{}', deps);
  const toolMs = nowMs() - start;
  onTiming?.(toolMs);
  onTool?.({ name, phase: 'done', ok: result.ok });
  if (!result.ok) return null;
  // Flight tools: the composer's sentence (null for unclear questions, then the model answers). Rules and live position have no composer: the knowledge text / "not available offline" comes from the tool result.
  const text =
    composeAnswer(question, [{ name, ok: true, data: result.data }], deps.now()) ??
    (name === 'search_knowledge' || name === 'get_live_tracking' ? answerFromTool(name, JSON.stringify({ result: result.data }), question) : null);
  return text ? { name, data: result.data, text } : null;
}
