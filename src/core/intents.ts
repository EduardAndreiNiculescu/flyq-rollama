import { INTENT_NAMES, type Intent, type IntentName, type NavigationRequest } from './types';

/** Allow-list of argument keys per intent; anything else is dropped. */
const ALLOWED_ARGS: Record<IntentName, string[]> = {
  GET_FLIGHT_DETAILS: ['flightNumber'],
  GET_FLIGHT_TIME_REMAINING: ['flightNumber'],
  LOOKUP_AIRPORT_PROCEDURE: ['topic'],
  GET_BAGGAGE_GUIDANCE: ['topic'],
  GET_TRAVEL_DOCUMENT_GUIDANCE: ['topic'],
  OPEN_AIRPORT_MAP: ['destination'],
  GET_DESTINATION_INFORMATION: ['airportCode'],
  GENERAL_QUESTION: [],
};

const MAX_ARG_LEN = 64;

/**
 * Extract and validate an intent from model output. The model only *requests*;
 * invalid output degrades to GENERAL_QUESTION and is never executed blindly.
 */
export function parseIntent(raw: string): Intent | null {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  let obj: unknown;
  try {
    obj = JSON.parse(match[0]);
  } catch {
    return null;
  }
  if (!obj || typeof obj !== 'object') return null;
  const name = (obj as { intent?: unknown }).intent;
  if (typeof name !== 'string' || !(INTENT_NAMES as readonly string[]).includes(name)) return null;
  const intent = name as IntentName;
  const rawArgs = (obj as { args?: unknown }).args;
  const args: Record<string, string> = {};
  if (rawArgs && typeof rawArgs === 'object') {
    for (const key of ALLOWED_ARGS[intent]) {
      const v = (rawArgs as Record<string, unknown>)[key];
      if (typeof v === 'string' && v.length > 0 && v.length <= MAX_ARG_LEN && !/[<>{}\\]/.test(v)) {
        args[key] = v.trim();
      }
    }
  }
  return { intent, args };
}

/** Map-module bridge: returns a validated navigation request or null. */
export function toNavigationRequest(intent: Intent): NavigationRequest | null {
  if (intent.intent !== 'OPEN_AIRPORT_MAP') return null;
  const dest = intent.args.destination;
  return dest ? { destination: dest } : null;
}
