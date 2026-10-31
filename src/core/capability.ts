import { detectLang } from './prompt';
import { tier1Capability } from './tier1';

/**
 * Requests outside FlyQ's contract. These are handled before a model sees
 * tools: the app can retrieve facts and guidance, never buy, book, check in,
 * change reservations or provide account credentials.
 */
const UNSUPPORTED = [
  /\b(?:fa|poti|vreau sa|as vrea sa|can you|could you)\b.{0,24}\bcheck[ -]?in\b/i,
  /\b(rezerva|cumpara|anuleaza|schimba|muta|plateste|comanda|activeaza|suna)\b/i,
  /\b(parola\s+(?:de\s+)?(?:wi[ -]?fi|internet)|upgrade\s+(?:la\s+)?business)\b/i,
];

/** Asking WHERE to exchange money is a map question, not a request to "change" a reservation: these phrases are removed before the action verbs are tested. */
const EXCHANGE = /\b(?:schimba\s+ban\w*|schimb(?:ul)?\s+valutar|case?\s+de\s+schimb(?:\s+valutar)?|birou(?:l)?\s+de\s+schimb|exchange\s+money|currency\s+exchange)\b/g;

const CHITCHAT = [
  /\b(spune[- ]mi\s+(?:un\s+)?banc|scrie[- ]mi\s+o\s+poezie|tell\s+me\s+a\s+joke)\b/i,
  /\b(vremea(?:\s+\w+){0,5}|weather\s+in|ce\s+zodie|what\s+star\s+sign)\b/i,
];

export function capabilityBoundary(question: string): 'unsupported-capability' | 'out-of-scope' | null {
  // JavaScript's \b treats Romanian diacritics as non-word characters. Work
  // with a normalized ASCII view so "cumpără" and "cumpara" share a boundary.
  const normalized = question.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const withoutExchange = normalized.replace(EXCHANGE, ' ');
  if (UNSUPPORTED.some(pattern => pattern.test(withoutExchange))) return 'unsupported-capability';
  if (CHITCHAT.some(pattern => pattern.test(normalized))) return 'out-of-scope';
  return tier1Capability(withoutExchange); // rules ported from the benchmark pipeline (see tier1.ts)
}

export function capabilityBoundaryReply(question: string): string {
  return detectLang(question) === 'ro'
    ? 'Nu pot efectua această acțiune. Te pot ajuta cu informații despre zbor, poartă, timp rămas, orientare în aeroport sau reguli de călătorie.'
    : 'I can’t perform that action. I can help with flight details, your gate, remaining time, airport directions, or travel rules.';
}
