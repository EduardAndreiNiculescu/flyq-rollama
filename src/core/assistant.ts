import { flightFacts, getFlight, DEMO_FLIGHTS } from './flight';
import { formatForPrompt, retrieve } from './knowledge';
import { buildSystemMessage, detectLang } from './prompt';
import { flightAnswer, flightQuestionType } from './templates';
import { toNavigationRequest } from './intents';
import { routeIntents } from './router';
import { correctQuestion, type Correction } from './spell';
import { checkAnswer, guardFallback, type Violation } from './guard';
import { needsClarification } from './clarify';
import type { FlightRecord, Intent, NavigationRequest, PassengerContext } from './types';

export type EngineToolCall = { id?: string; name: string; arguments: string };

export type ChatMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  /** assistant turn that requested tools */
  tool_calls?: { id?: string; type: 'function'; function: { name: string; arguments: string } }[];
  /** tool turn: which request this answers */
  tool_call_id?: string;
};

export type GenerateStats = {
  timeToFirstTokenMs: number | null;
  tokensPerSecond: number | null;
  totalMs: number;
  tokens: number;
};

/** Abstraction over the inference backend (llama.rn on device, mock in tests). */
export interface LlmEngine {
  generate(
    messages: ChatMessage[],
    onToken: (partial: string) => void,
    opts?: { maxTokens?: number; tools?: unknown[] },
  ): Promise<{ text: string; stats: GenerateStats; toolCalls?: EngineToolCall[] }>;
  stop(): Promise<void>;
}

/** Map module implements this; AI module never imports map code directly. */
export interface NavigationHandler {
  openAirportMap(req: NavigationRequest): void | Promise<void>;
}

export type AskResult = {
  text: string;
  intent: Intent;
  /** every intent found in the question, earliest first (intent === intents[0]) */
  intents: Intent[];
  /** typos repaired for routing/retrieval (the model still sees the passenger's own words) */
  corrections: Correction[];
  navigation: NavigationRequest | null;
  usedDocIds: string[];
  missingInfo: string[];
  stats: GenerateStats;
  /** 'template' = fixed code-built answer, the model was not called */
  /** where the text came from: fixed code answer, the LLM, a clarifying question, or the safe fallback after the guard rejected the LLM */
  source: 'template' | 'model' | 'clarification' | 'guard_fallback';
  /** set when the answer guard rejected the model's text (original kept for debugging, never shown) */
  guard?: { violations: Violation[]; original: string };
};

export { routeIntent, routeIntents } from './router';

export class FlightFlowAssistant {
  private history: ChatMessage[] = [];
  private stickyFlight: string | null = null;

  constructor(
    private engine: LlmEngine,
    private opts: {
      flights?: FlightRecord[];
      nav?: NavigationHandler;
      now?: () => Date;
      maxHistoryTurns?: number;
      /** Answer single exact flight questions (gate, arrival...) from code, not the model. Default true. */
      deterministicFlightAnswers?: boolean;
      /** reject model answers with numbers/gates/status claims not in the context (default true) */
      answerGuard?: boolean;
      /** ask one short question instead of guessing when the request is incomplete (default true) */
      clarify?: boolean;
    } = {},
  ) {}

  reset() {
    this.history = [];
    this.stickyFlight = null;
  }

  stop() {
    return this.engine.stop();
  }

  async ask(
    question: string,
    context: PassengerContext,
    onToken: (partial: string) => void,
  ): Promise<AskResult> {
    const now = (this.opts.now ?? (() => new Date()))();
    const lang = detectLang(question);
    // Typos are repaired only for routing and retrieval; the model sees the passenger's original text.
    const fixed = correctQuestion(question);
    const intents = routeIntents(fixed.text);
    const intent = intents[0];
    const flights = this.opts.flights ?? DEMO_FLIGHTS;
    const missingInfo: string[] = [];

    // Sticky flight: a number the passenger named (and that we know) answers later follow-ups like "is it delayed?".
    // A number named in the current question still wins for that question (intent.args), and an unknown number never sticks.
    const mentioned = intents.find((i) => i.args.flightNumber)?.args.flightNumber;
    if (mentioned && getFlight(mentioned, flights)) this.stickyFlight = mentioned;
    if (this.stickyFlight) context = { ...context, flightNumber: this.stickyFlight };

    // Exact flight questions (one flight intent, nothing else in the question) never need the model.
    if (this.opts.deterministicFlightAnswers !== false && intents.length === 1 && (intent.intent === 'GET_FLIGHT_DETAILS' || intent.intent === 'GET_FLIGHT_TIME_REMAINING')) {
      const type = flightQuestionType(fixed.text);
      const flight = type ? getFlight(intent.args.flightNumber ?? context.flightNumber, flights) : null;
      const answer = type && flight ? flightAnswer(type, lang, { flight, now, question: fixed.text }) : null;
      if (answer) {
        onToken(answer);
        this.history.push({ role: 'user', content: question }, { role: 'assistant', content: answer });
        const stats: GenerateStats = { timeToFirstTokenMs: null, tokensPerSecond: null, totalMs: 0, tokens: 0 };
        return { text: answer, intent, intents, corrections: fixed.changes, navigation: null, usedDocIds: [], missingInfo: [], stats, source: 'template' };
      }
    }

    const hits = retrieve(fixed.text, lang, 3);
    const flightIntent0 = intents.find((i) => i.intent === 'GET_FLIGHT_DETAILS' || i.intent === 'GET_FLIGHT_TIME_REMAINING');
    if (this.opts.clarify !== false) {
      const c = needsClarification({
        question,
        intents,
        hasFlight: !!getFlight(flightIntent0?.args.flightNumber ?? context.flightNumber, flights),
        retrievalHitCount: hits.length,
        corrections: fixed.changes.length,
        lang,
      });
      if (c) {
        onToken(c.ask);
        this.history.push({ role: 'user', content: question }, { role: 'assistant', content: c.ask });
        const stats: GenerateStats = { timeToFirstTokenMs: null, tokensPerSecond: null, totalMs: 0, tokens: 0 };
        return { text: c.ask, intent, intents, corrections: fixed.changes, navigation: null, usedDocIds: [], missingInfo: [c.reason], stats, source: 'clarification' };
      }
    }

    let facts: string | null = null;
    const flightIntent = intents.find((i) => i.intent === 'GET_FLIGHT_DETAILS' || i.intent === 'GET_FLIGHT_TIME_REMAINING');
    if (flightIntent) {
      const flight = getFlight(flightIntent.args.flightNumber ?? context.flightNumber, flights);
      if (flight) facts = flightFacts(flight, now);
      else missingInfo.push('flight');
    }

    let navigation: NavigationRequest | null = null;
    const navIntent = intents.find((i) => i.intent === 'OPEN_AIRPORT_MAP');
    if (navIntent) {
      navigation = toNavigationRequest(navIntent);
      if (!navigation) missingInfo.push('destination');
      else if (this.opts.nav) {
        await this.opts.nav.openAirportMap({ ...navigation, fromZone: context.currentZone });
      }
    }

    const system = buildSystemMessage({
      flightFacts: facts,
      documents: formatForPrompt(hits),
      context,
      now,
    });
    const notes: string[] = [];
    if (missingInfo.length) notes.push(`(app note: missing information: ${missingInfo.join(', ')})`);
    if (navigation) notes.push(`(app note: the map was requested for "${navigation.destination}"; ${this.opts.nav ? 'it has been opened' : 'no map module is connected'})`);

    const maxTurns = this.opts.maxHistoryTurns ?? 3;
    const messages: ChatMessage[] = [
      { role: 'system', content: system },
      ...this.history.slice(-maxTurns * 2),
      { role: 'user', content: [question, ...notes].join('\n') },
    ];

    const { text, stats } = await this.engine.generate(messages, onToken, { maxTokens: 320 });
    const usedDocIds = hits.map((h) => h.entry.id);

    if (this.opts.answerGuard !== false) {
      const verdict = checkAnswer({ answer: text, context: messages.map((m) => m.content).join('\n'), lang });
      if (!verdict.ok) {
        // Prefer the exact code answer for a flight question; otherwise a generic honest message.
        const type = flightQuestionType(fixed.text);
        const flight = type ? getFlight(flightIntent?.args.flightNumber ?? context.flightNumber, flights) : null;
        const safe = (type && flight ? flightAnswer(type, lang, { flight, now, question: fixed.text }) : null) ?? guardFallback(lang, verdict.violations);
        onToken(safe); // replaces the rejected text on screen
        this.history.push({ role: 'user', content: question }, { role: 'assistant', content: safe });
        return { text: safe, intent, intents, corrections: fixed.changes, navigation, usedDocIds, missingInfo, stats, source: 'guard_fallback', guard: { violations: verdict.violations, original: text } };
      }
    }
    this.history.push({ role: 'user', content: question }, { role: 'assistant', content: text });
    return { text, intent, intents, corrections: fixed.changes, navigation, usedDocIds, missingInfo, stats, source: 'model' };
  }
}
