import { airportPoint } from '../../core/airports';
import { FlightFlowAssistant, type ChatMessage, type GenerateStats, type LlmEngine, type NavigationHandler } from '../../core/assistant';
import { buildSystemMessage } from '../../core/prompt';
import type { FlightRecord, PassengerContext } from '../../core/types';
import { toolPrompt, type Contract } from '../../llm/contract';
import { DEFAULT_CONFIG, LlamaEngine } from '../../llm/llamaEngine';
import { checkModel, provisionModel, type ModelStatus } from '../../llm/modelProvision';
import { buildRouterPrompt } from '../../llm/rollama';
import { ROUTER_DEBUG, RollamaEngine } from '../../llm/rollamaEngine';
import { useAssistantDiag } from '../../store/assistantDiag';
import { useFlightStatus } from '../../store/flightStatus';
import { useModelUi, useProgress } from '../../store/assistantUi';
import { useLive, type ModelTier } from '../../store/live';
import { useAnswerStats } from '../../store/stats';
import { guardToolAnswer } from '../../tools/guardAnswer';
import { runToolLoop, type ToolTiming } from '../../tools/loop';
import { createTools, toolSpecs, type ToolDeps } from '../../tools/registry';
import { TOOL_MODE_NOTE } from '../../tools/toolMode';
import type { Flight, FlightContext } from '../../types';
import type { AssistantService } from '../types';
import { fetchFlight } from './gatewayClient';
import { getLiveEntry } from './liveFlights';
import { flightKey } from './livePosition';

export type DeviceDeps = {
  now: () => Date;
  phase: () => 'ground' | 'inAir' | 'landed';
  openMap: NavigationHandler['openAirportMap'];
  /** Local clock time of an instant at an airport ("08:10"), from the airport UTC offset; null when the airport is unknown. */
  localTime?: (utcIso: string, airportCode: string) => string | null;
};

/** Marker: a streamed chunk that starts with this replaces the whole text so far (the answer guard can swap a rejected answer). */
export const REPLACE = '\u0001';

const MSG = {
  missing: { ro: 'Modelul nu e descărcat pe telefon. Îl descarci din ecranul „Mod test”, apoi întrebi din nou.', en: 'The model is not on this phone yet. Download it from the "Test mode" screen, then ask again.' },
  failed: { ro: 'Modelul de pe telefon nu a putut porni.', en: 'The on-device model could not start.' },
};

export const engine = new LlamaEngine();
/** RoLlama is the only model: a router that picks the tool (JSON); the words come from the composer and templates. */
export const rollama = new RollamaEngine(engine);

export async function deviceModelState(): Promise<ModelStatus['state']> {
  const tier = useLive.getState().modelTier;
  return (await checkModel(tier)).state;
}
export const downloadDeviceModel = (tier?: ModelTier) => provisionModel(tier ?? useLive.getState().modelTier);

/** Loads the base model, plus the LoRA adapter when its file is on the phone (the same model the laptop tests use). */
/** Test levers (set from the laptop, see deviceLink): LoRA on/off, context size, attention-cache type, and which prompt contract the tool mode sends. */
export const deviceOpts = { adapter: true, nCtx: DEFAULT_CONFIG.nCtx, kv: 'f16' as 'f16' | 'q8_0', contract: 'v4' as Contract };
engine.onStatus = s => useModelUi.getState().set(s === 'recovering' ? 'recovering' : 'ready');
export async function loadDeviceModel(): Promise<boolean> {
  const tier = useLive.getState().modelTier;
  if (tier === 'no-ai') return true;
  if (engine.ready) return true;
  const ui = useModelUi.getState();
  const st = await checkModel(tier);
  if (st.state !== 'ready') {
    ui.set('missing');
    console.error('[FlyQ] on-device model is not usable:', st.state);
    return false;
  }
  ui.set('preparing');
  try {
    await engine.load(st.path, { ...DEFAULT_CONFIG, nCtx: deviceOpts.nCtx, kv: deviceOpts.kv }, undefined, null); // RoLlama is merged: no LoRA to attach
  } catch (e) {
    ui.set('failed');
    console.error('[FlyQ] on-device model failed to load:', String(e)); // reaches the native console in release builds
    throw e;
  }
  ui.set('ready');
  return true;
}
/** Test hook: reload with or without the LoRA adapter and with another context size. */
export async function reloadDevice(o: { adapter?: boolean; nCtx?: number; kv?: 'f16' | 'q8_0'; tier?: ModelTier }): Promise<boolean> {
  if (o.adapter !== undefined) deviceOpts.adapter = o.adapter;
  if (o.nCtx !== undefined) deviceOpts.nCtx = o.nCtx;
  if (o.kv !== undefined) deviceOpts.kv = o.kv;
  if (o.tier !== undefined) useLive.getState().setModelTier(o.tier);
  await engine.unload();
  return loadDeviceModel();
}
export const adapterLoaded = () => engine.loraPath !== null;

export function recordFor(flight: Flight): FlightRecord {
  const live = getLiveEntry(flight.id)?.record;
  if (live) return live;
  const o = useFlightStatus.getState().overlays[flight.id];
  return {
    estimatedDeparture: o?.estimatedDeparture ?? null,
    estimatedArrival: o?.estimatedArrival ?? null,
    departureDelayMin: o?.departureDelayMin ?? null,
    arrivalDelayMin: o?.arrivalDelayMin ?? null,
    providerStatus: o?.providerStatus ?? null,
    flightNumber: flightKey(flight),
    departureAirport: flight.from,
    arrivalAirport: flight.to,
    scheduledDeparture: flight.scheduledDepartureUtc ?? flight.departureUtc,
    scheduledArrival: flight.scheduledArrivalUtc ?? flight.arrivalUtc,
    gate: flight.gate,
    gateStatus: 'confirmed',
    dataSource: 'demo',
    lastUpdated: null,
  };
}

function passengerContext(deps: DeviceDeps, flight: Flight, record: FlightRecord, seat?: string, boarding?: string): PassengerContext {
  const phase = deps.phase();
  return {
    flightNumber: record.flightNumber,
    airportCode: flight.from,
    journeyStage: phase === 'inAir' ? 'in_flight' : phase === 'landed' ? 'arrival' : 'airside',
    connectionAvailable: false,
    seat,
    boarding,
  };
}

/** Wraps the engine to add up time and tokens over every model call of one answer. */
function metered(inner: LlmEngine) {
  const calls: GenerateStats[] = [];
  const e: LlmEngine = {
    async generate(messages, onToken, opts) {
      const r = await inner.generate(messages, onToken, opts);
      calls.push(r.stats);
      return r;
    },
    stop: () => inner.stop(),
  };
  const summary = () => {
    const tokens = calls.reduce((a, c) => a + c.tokens, 0);
    const gen = calls.reduce((a, c) => a + (c.tokensPerSecond && c.tokens ? c.tokens / c.tokensPerSecond : 0), 0);
    return { ttftMs: calls[0]?.timeToFirstTokenMs ?? null, tokensPerSecond: gen > 0 ? tokens / gen : null, tokens, totalMs: calls.reduce((a, c) => a + c.totalMs, 0) };
  };
  return { e, summary, count: () => calls.length };
}

/** Streams increments from a callback that reports the accumulated text. */
async function* streamFrom(run: (onToken: (partial: string) => void) => Promise<unknown>): AsyncGenerator<string> {
  const queue: string[] = [];
  let wake: (() => void) | null = null;
  let finished = false;
  let shown = '';
  const push = (s: string) => {
    queue.push(s);
    wake?.();
  };
  const done = run(partial => {
    push(partial.startsWith(shown) ? partial.slice(shown.length) : REPLACE + partial);
    shown = partial;
  }).finally(() => {
    finished = true;
    wake?.();
  });
  while (!finished || queue.length) {
    if (!queue.length) await new Promise<void>(r => (wake = r));
    wake = null;
    const next = queue.shift();
    if (next) yield next;
  }
  await done;
}

/** Mode "Telefon": the app's own stack. Deterministic router and templates first, the model for the rest, answer guard last. */
export class DeviceAssistantService implements AssistantService {
  private assistant: FlightFlowAssistant | null = null;
  private forFlight: string | null = null;
  private record: FlightRecord | null = null;
  private meter: ReturnType<typeof metered> | null = null;

  constructor(private deps: DeviceDeps) {}

  reset() {
    this.assistant = null;
    this.forFlight = null;
  }

  async *ask(question: string, context: FlightContext): AsyncIterable<string> {
    const lang = context.language;
    const tier = useLive.getState().modelTier;
    if (tier !== 'no-ai') {
      try {
        if (!(await loadDeviceModel())) {
          yield MSG.missing[lang];
          return;
        }
      } catch {
        yield MSG.failed[lang];
        return;
      }
    }
    if (this.forFlight !== context.flight.id || !this.assistant) {
      this.record = recordFor(context.flight);
      this.forFlight = context.flight.id;
      this.meter = metered(rollama);
      this.assistant = new FlightFlowAssistant(this.meter.e, { flights: [this.record], nav: { openAirportMap: r => this.deps.openMap(r) }, now: this.deps.now });
    }
    const before = this.meter!.count();
    yield* streamFrom(async onToken => {
      try {
        const res = await this.assistant!.ask(question, passengerContext(this.deps, context.flight, this.record!), onToken);
        const s = this.meter!.summary();
        useAnswerStats.getState().set({ mode: 'Telefon · fluxul aplicației', via: res.source, modelUsed: this.meter!.count() > before, ttftMs: res.stats.timeToFirstTokenMs ?? s.ttftMs, tokensPerSecond: res.stats.tokensPerSecond ?? s.tokensPerSecond, tokens: res.stats.tokens, totalMs: res.stats.totalMs, tools: [], adapter: adapterLoaded() });
      } catch {
        onToken(REPLACE + MSG.failed[lang]);
      }
    });
  }
}

/** Mode "Telefon + unelte": the model drives the tools, exactly like the laptop gateway (same prompt, same tools, same loop). */
export class DeviceToolsAssistantService implements AssistantService {
  private history: ChatMessage[] = [];
  private forFlight: string | null = null;

  constructor(private deps: DeviceDeps) {}

  /**
   * Loads the model and runs one token through it with the real system prompt and tools, so the first question does not pay for
   * model loading and Metal shader compilation. Only the shared start of the prompt is reused afterwards (the clock sits early in it).
   */
  async warmUp(context: FlightContext): Promise<void> {
    try {
      if (!(await loadDeviceModel())) return;
      await engine.completeRaw(buildRouterPrompt('.'), { maxTokens: 1 }); // pays for Metal shader compilation before the first question
    } catch {
      /* warming up is best effort */
    }
  }

  async stop(): Promise<void> {
    await engine.stop();
  }

  reset() {
    this.history = [];
    this.forFlight = null;
  }

  async *ask(question: string, context: FlightContext): AsyncIterable<string> {
    const lang = context.language;
    if (this.forFlight !== context.flight.id) {
      this.history = [];
      this.forFlight = context.flight.id;
    }
    const record = recordFor(context.flight);
    const pctx = passengerContext(this.deps, context.flight, record, context.ticket?.pass?.seat, this.deps.localTime?.(context.flight.boardingUtc, context.flight.from) ?? undefined);
    const now = this.deps.now();
    const toolDeps: ToolDeps = {
      now: () => now,
      context: pctx,
      flights: [record],
      // Live position only when the gateway is reachable; offline the tool says so.
      tracking: async fn => (await fetchFlight(fn).catch(() => ({ tracking: null }))).tracking,
      airportPoint,
      nav: { openAirportMap: r => this.deps.openMap(r) },
    };
    const prompt = toolPrompt(deviceOpts.contract, { now, context: pctx });
    let modelMissing = false;
    const lazyEngine: LlmEngine = {
      async generate(messages, onToken, opts) {
        const tier = useLive.getState().modelTier;
        if (tier === 'no-ai') {
          const fallback = lang === 'ro'
            ? 'Sunt asistentul offline al aeroportului. În modul fără AI pot răspunde direct la întrebările despre zbor, orar, poartă, bagaje sau reguli.'
            : 'I am the offline airport assistant. In no-AI mode, I only answer direct questions about flights, schedule, gate, baggage, or rules.';
          return { text: fallback, stats: { timeToFirstTokenMs: 1, tokensPerSecond: 1000, totalMs: 1, tokens: 10 }, toolCalls: [] };
        }
        if (!(await loadDeviceModel())) {
          modelMissing = true;
          throw new Error('device model missing');
        }
        return rollama.generate(messages, onToken, opts); // the router candidates (opts.tools) reach the engine
      },
      stop: () => engine.stop(),
    };
    const m = metered(lazyEngine);
    let text = '';
    let trace: string[] = [];
    let path: 'fast' | 'composed' | 'model' | undefined;
    let timing: ToolTiming | undefined;
    let guardViolations: string[] = [];
    let failed = false;
    const started = performance.now();
    useProgress.getState().begin();
    try {
      const out = await runToolLoop(m.e, [{ role: 'system', content: prompt.system }, ...this.history.slice(-6), { role: 'user', content: question }], toolDeps, () => {}, {
        specs: prompt.specs,
        maxSteps: 3,
        maxTokens: 300,
        fastPath: true,
        intentRouting: true,
        allowSideEffects: true,
        onTool: e => useProgress.getState().tool(e.name, e.phase),
      });
      // A composed sentence comes from the tool result with its caveats; the guard (for free model text) would flag "a aterizat / is delayed" as status claims.
      const g = out.path !== 'model' ? { text: out.text, violations: [] as { kind: string }[] } : guardToolAnswer(out.messages, out.text, question, [record.flightNumber]);
      text = g.text;
      trace = out.trace.map(t => t.name);
      if (ROUTER_DEBUG) trace.push('json:' + rollama.lastRaw.slice(0, 90) + ' => ' + rollama.lastDecision); // dev line: the model raw router output and what the engine did with it
      path = out.path;
      timing = out.timing;
      guardViolations = g.violations.map(v => v.kind);
      // One line per turn for the Mod test diagnostic box and the native console: enough to see why an answer was what it was.
      let docs = '';
      let toolNote = '';
      for (const mm of out.messages) {
        if (mm.role !== 'tool') continue;
        try {
          const j = JSON.parse(mm.content) as { result?: { documents?: { id: string }[]; safetyRefusal?: string; note?: string }; error?: string };
          if (j.result?.documents) docs = j.result.documents.map(d => d.id).join(',') || 'none';
          if (j.result?.safetyRefusal) toolNote += ` refused:${j.result.safetyRefusal}`;
          if (j.error) toolNote += ` error:${j.error}`;
        } catch {
          /* a tool message that is not JSON: nothing to read */
        }
      }
      const line = `${new Date().toLocaleTimeString()} q="${question.slice(0, 60)}" path=${out.path} tools=${out.trace.map(t => t.name).join('+') || '-'} model=${rollama.lastRaw.slice(0, 70) || '-'} decision=${rollama.lastDecision || '-'} docs=[${docs || '-'}]${toolNote} src=${useLive.getState().assistantSource} ready=${engine.ready} -> ${text.slice(0, 70)}`;
      useAssistantDiag.getState().push(line);
      console.error('[FlyQ] ask: ' + line);
    } catch {
      text = modelMissing ? MSG.missing[lang] : MSG.failed[lang];
      failed = true;
    } finally {
      useProgress.getState().end();
    }
    const s = m.summary();
    useAnswerStats.getState().set({ mode: 'Telefon · unelte', via: failed ? 'error' : 'tools', modelUsed: m.count() > 0, ...s, totalMs: performance.now() - started, tools: trace, path, timing, guardViolations, adapter: adapterLoaded() });
    if (!failed) this.history.push({ role: 'user', content: question }, { role: 'assistant', content: text });
    // Not streamed: during the tool step the model's partial text would be a raw <tool_call>.
    for (const part of text.split(/(\s+)/)) {
      if (part) yield part;
    }
  }
}
