import type { Intent } from './types';

/**
 * Deterministic clarification: when the assistant would have to guess, ask ONE short question instead.
 * Pure function, no model call. It only asks for the flight number/date (flight intents without a known
 * flight), a destination (navigation without one) or "what do you need" (nearly empty, unanswerable input).
 */

export type ClarifyReason = 'no_flight' | 'no_destination' | 'too_vague';

export type ClarifyInput = {
  question: string;
  intents: Intent[];
  hasFlight: boolean;
  retrievalHitCount: number;
  corrections: number;
  lang: 'ro' | 'en';
};

const norm = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

// Greetings, thanks, chit-chat: never interrogated, the assistant just answers.
const SOCIAL = new Set([
  'salut', 'buna', 'bunaziua', 'hello', 'hi', 'hey', 'hei', 'servus', 'ciao', 'noroc', 'multumesc', 'multumim', 'mersi', 'merci',
  'thanks', 'thank', 'thx', 'ok', 'okay', 'da', 'nu', 'yes', 'no', 'pa', 'bye', 'goodbye', 'seara', 'dimineata', 'morning', 'evening',
  'good', 'bine', 'super', 'great', 'perfect', 'please', 'te', 'rog', 'you', 'ziua', 'ce', 'faci', 'mai', 'cum', 'esti', 'how', 'are', 'u',
]);
// Words that carry no request by themselves.
const EMPTY = new Set([
  'help', 'ajutor', 'ajuta', 'ma', 'mi', 'imi', 'me', 'i', 'need', 'nevoie', 'am', 'vreau', 'want', 'it', 'asta', 'aia', 'ceva', 'something',
  'this', 'that', 'si', 'and', 'a', 'o', 'un', 'the', 'is', 'e', 'este', 'sa', 'pot', 'can', 'you', 'tu', 'eu', 'el', 'ea', 'he', 'she',
  'ei', 'ele', 'ce', 'what', 'unde', 'where', 'cum', 'how', 'care', 'which', 'cine', 'who', 'cand', 'when', 'de', 'la', 'pe', 'in', 'to',
]);

const ASKS: Record<ClarifyReason, { ro: string; en: string }> = {
  no_flight: {
    ro: 'Pentru asta am nevoie de zborul tău. Îmi spui numărul zborului și data (de exemplu, RO123, 12 mai)?',
    en: 'I need your flight for that. Could you tell me the flight number and date (for example, RO123, 12 May)?',
  },
  no_destination: {
    ro: 'Unde vrei să ajungi? De exemplu: poarta, toaleta, ieșirea sau controlul de securitate.',
    en: 'Where would you like to go? For example: your gate, a restroom, an exit or security.',
  },
  too_vague: {
    ro: 'Nu am înțeles exact. Îmi spui pe scurt ce ai nevoie?',
    en: "I didn't quite catch that. Could you tell me briefly what you need?",
  },
};

const FLIGHT_INTENTS = new Set(['GET_FLIGHT_DETAILS', 'GET_FLIGHT_TIME_REMAINING']);
// Knowledge questions that merely mention a flight word (terminology, passenger rights, hypotheticals).
const GENERIC = /(?:^| )(ce inseamna|what does|what do|what is the difference|diferenta|drepturi|dreptul|rights|compensation|compensatie|despagubir|what if|ce se intampla|what happens|what can i ask|ce pot cere)/;
const WANTS_MAP = /\b(harta|map)\b/;

export function needsClarification(input: ClarifyInput): { ask: string; reason: ClarifyReason } | null {
  const { intents, hasFlight, retrievalHitCount, corrections, lang } = input;
  const text = norm(input.question);
  const toks = text.split(' ').filter(Boolean);
  const make = (reason: ClarifyReason) => ({ ask: ASKS[reason][lang], reason });

  if (toks.length === 0) return make('too_vague');

  // Social turns are never questioned.
  if (toks.every((t) => SOCIAL.has(t))) return null;

  // Flight intent but no flight known (neither selected nor typed in the question).
  const flightIntent = intents.find((i) => FLIGHT_INTENTS.has(i.intent));
  const otherSpecific = intents.some((i) => !FLIGHT_INTENTS.has(i.intent) && i.intent !== 'GENERAL_QUESTION' && i.intent !== 'OPEN_AIRPORT_MAP');
  if (flightIntent && !hasFlight && !flightIntent.args.flightNumber && !otherSpecific && !GENERIC.test(text)) return make('no_flight');

  // Navigation without a destination (asking for the map itself is fine: it just opens).
  const nav = intents.find((i) => i.intent === 'OPEN_AIRPORT_MAP');
  if (nav && !nav.args.destination && !WANTS_MAP.test(text) && !intents.some((i) => i.intent !== 'OPEN_AIRPORT_MAP' && i.intent !== 'GENERAL_QUESTION')) {
    return make('no_destination');
  }

  // Nearly empty general question that retrieval cannot ground either.
  const onlyGeneral = intents.length > 0 && intents.every((i) => i.intent === 'GENERAL_QUESTION');
  if (onlyGeneral && retrievalHitCount === 0) {
    const content = toks.filter((t) => !EMPTY.has(t) && !SOCIAL.has(t));
    const veryShort = text.replace(/ /g, '').length < 4;
    // Garbled input (spell-corrector had to fix several words) with no real content word is also unanswerable.
    if (content.length === 0 || veryShort || (corrections >= 3 && content.length <= 2)) return make('too_vague');
  }
  return null;
}
