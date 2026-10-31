import { routeIntents } from '../../src/core/router';
import { DEMO_FLIGHTS, flightFacts, getFlight } from '../../src/core/flight';
import { formatForPrompt, retrieve } from '../../src/core/knowledge';
import { buildSystemMessage, detectLang } from '../../src/core/prompt';

/** Fixed clock so runs are reproducible. */
export const EVAL_NOW = new Date('2026-10-31T09:00:00Z');

/** Messages exactly as the app builds them for a plain question (router + flight facts + retrieval). */
export function messagesForQuestion(question: string, withRetrieval = true) {
  const intents = routeIntents(question);
  const fi = intents.find((i) => i.intent === 'GET_FLIGHT_DETAILS' || i.intent === 'GET_FLIGHT_TIME_REMAINING');
  const flight = fi || /DEMO\d+/i.test(question) ? getFlight(fi?.args.flightNumber ?? 'DEMO123', DEMO_FLIGHTS) : null;
  const docs = withRetrieval ? formatForPrompt(retrieve(question, detectLang(question), 3)) : '(none)';
  const system = buildSystemMessage({
    flightFacts: flight ? flightFacts(flight, EVAL_NOW) : null,
    documents: docs,
    now: EVAL_NOW,
    context: { flightNumber: 'DEMO123', connectionAvailable: false },
  });
  return [
    { role: 'system', content: system },
    { role: 'user', content: question },
  ];
}
