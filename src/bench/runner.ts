import { assistant, clock, flightData, resetAssistants } from '../services';
import { adapterLoaded } from '../services/live/DeviceAssistantService';
import { useLive, type AssistantSource } from '../store/live';
import { useAnswerStats } from '../store/stats';
import { useTickets } from '../store/tickets';
import type { BenchQ } from './questions';
import { toolOk } from './questions';
import type { ToolTiming } from '../tools/loop';
import { benchState } from './state';

export type BenchResult = {
  i: number;
  id: string;
  q: string;
  cat: string;
  expect: string[];
  answer: string;
  ms: number;
  source: string;
  mode: string;
  via: string;
  modelUsed: boolean;
  path?: 'fast' | 'composed' | 'model';
  timing?: ToolTiming;
  tokensPerSecond: number | null;
  ttftMs: number | null;
  tokens: number;
  tools: string[];
  adapter: boolean;
  toolOk: boolean | null;
};

const REPLACE = '\u0001';

/** One question through the currently selected assistant, with its measurements. */
export async function askMeasured(q: BenchQ | { q: string; lang?: 'ro' | 'en'; id?: string; cat?: string; expect?: string[] }): Promise<Omit<BenchResult, 'i'>> {
  const { tickets, activeTicketId } = useTickets.getState();
  const ticket = tickets.find(t => t.id === activeTicketId) ?? null;
  const flight = ticket ? flightData.getFlight(ticket.flightId) : null;
  if (!ticket || !flight) throw new Error('no_flight');
  useAnswerStats.setState({ last: null });
  const t0 = Date.now();
  let text = '';
  for await (const tok of assistant.ask(q.q, { flight, ticket, nowUtc: clock.now().toISOString(), language: q.lang ?? 'ro' })) text = tok.startsWith(REPLACE) ? tok.slice(1) : text + tok;
  const ms = Date.now() - t0;
  const st = useAnswerStats.getState().last;
  const source = useLive.getState().assistantSource;
  const tools = st?.tools ?? [];
  const expect = q.expect ?? ['*'];
  return {
    id: q.id ?? '', q: q.q, cat: q.cat ?? '', expect, answer: text.slice(0, 800), ms, source, mode: st?.mode ?? source, via: st?.via ?? (source === 'mock' ? 'mock' : '?'),
    modelUsed: !!st?.modelUsed, path: st?.path, timing: st?.timing, tokensPerSecond: st?.tokensPerSecond ?? null, ttftMs: st?.ttftMs ?? null, tokens: st?.tokens ?? 0, tools, adapter: adapterLoaded(),
    // Score the first actual tool choice only when the tool pipeline returned an answer.
    toolOk: (source === 'laptop' || source === 'deviceTools') && st?.via === 'tools' ? toolOk(expect, tools) : null,
  };
}

/**
 * Runs the questions in order. The assistant cannot navigate away meanwhile (benchState), results are handed out one by one,
 * and the previously selected source is restored at the end.
 */
export async function runBenchmark(questions: BenchQ[], opts: { source?: AssistantSource; onItem?: (r: BenchResult) => void | Promise<void> } = {}): Promise<BenchResult[]> {
  const live = useLive.getState();
  const previous = live.assistantSource;
  if (opts.source) live.setAssistantSource(opts.source);
  benchState.active = true;
  const out: BenchResult[] = [];
  try {
    for (const [i, q] of questions.entries()) {
      // Each benchmark question stands alone, like the laptop run: without this the assistant carried the last three
      // question/answer pairs (refusals included) into the next prompt, and the model copied them.
      resetAssistants();
      const r = { i, ...(await askMeasured(q)) };
      out.push(r);
      await opts.onItem?.(r);
    }
  } finally {
    benchState.active = false;
    useLive.getState().setAssistantSource(previous);
  }
  return out;
}

const median = (a: number[]) => (a.length ? [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)] : null);
export function summarize(rs: BenchResult[]) {
  const scored = rs.filter(r => r.toolOk !== null);
  return {
    n: rs.length,
    medianMs: median(rs.map(r => r.ms)),
    medianTps: median(rs.filter(r => r.tokensPerSecond).map(r => r.tokensPerSecond!)),
    medianTtftMs: median(rs.filter(r => r.ttftMs).map(r => r.ttftMs!)),
    modelAnswers: rs.filter(r => r.modelUsed).length,
    templateAnswers: rs.filter(r => r.via === 'template').length,
    toolScored: scored.length,
    toolOk: scored.filter(r => r.toolOk).length,
  };
}
