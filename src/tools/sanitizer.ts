import { normalize } from '../core/router';

/**
 * Deterministic flight number extraction from raw passenger input.
 * Matches:
 *  - Standard airline codes + flight numbers: RO123, RO 123, W61234, W6 1234, AF1520, XY7437, KL1375, TAR123
 *  - Demo flights: DEMO123, DEMO 507, DEMO507
 * Rejects gates (B12, A1), technical terms (MP3, COVID19), and phone numbers.
 */
const FLIGHT_NO_RE = /\b([A-Z]{2}\s*\d{2,4}|[A-Z]\d\s*\d{3,4}|\d[A-Z]\s*\d{3,4}|[A-Z]{3}\s*\d{2,4}|DEMO\s*\d{1,4})\b/i;
const GATE_PATTERN = /\b(?:gate|poarta|poarta de imbarcare)\s+[A-Z0-9]+\b/i;
const NOT_FLIGHT_PREFIX = new Set(['COVID', 'MP', 'USB', 'WIFI', 'SMS', 'EUR', 'RON', 'USD']);

export function extractFlightNumber(text: string): string | null {
  if (!text) return null;
  const upper = text.toUpperCase();
  const match = upper.match(FLIGHT_NO_RE);
  if (!match) return null;

  const rawMatch = match[1];
  const cleaned = rawMatch.replace(/\s+/g, '');

  for (const p of NOT_FLIGHT_PREFIX) {
    if (cleaned.startsWith(p)) return null;
  }

  // Ensure it wasn't preceded by 'gate' or 'poarta' if single letter gate
  const idx = upper.indexOf(match[0]);
  if (idx > 0) {
    const before = upper.slice(Math.max(0, idx - 15), idx).trim();
    if (/\b(?:GATE|POARTA|POARTÃ|POARTĂ)$/i.test(before)) {
      return null;
    }
  }

  return cleaned;
}

/**
 * Valid airport map destinations supported by the indoor navigation facility database.
 */
const VALID_MAP_DESTINATIONS = [
  { stems: ['toalet', 'baie', 'baia', 'wc', 'toilet', 'restroom', 'bathroom', 'lavatory'], canonicalRo: 'toaleta', canonicalEn: 'toilet' },
  { stems: ['iesire', 'exit'], canonicalRo: 'ieșirea', canonicalEn: 'exit' },
  { stems: ['poart', 'gate'], canonicalRo: 'poarta mea', canonicalEn: 'my gate' },
  { stems: ['securit', 'security', 'control'], canonicalRo: 'controlul de securitate', canonicalEn: 'security control' },
  { stems: ['informati', 'information', 'info'], canonicalRo: 'ghișeul de informații', canonicalEn: 'information desk' },
  { stems: ['cafenea', 'cafe', 'restaurant', 'manca', 'mananc', 'eat', 'food', 'mancare', 'bufet'], canonicalRo: 'restaurant sau cafenea', canonicalEn: 'food and cafes' },
  { stems: ['parcar', 'parking', 'carpark'], canonicalRo: 'parcarea', canonicalEn: 'car park' },
  { stems: ['taxi', 'taxiuri'], canonicalRo: 'taxiurile', canonicalEn: 'taxis' },
  { stems: ['banda', 'bagaje', 'baggage', 'luggage', 'claim'], canonicalRo: 'zona de bagaje', canonicalEn: 'baggage claim' },
  { stems: ['check', 'checkin'], canonicalRo: 'check-in', canonicalEn: 'check-in' },
  { stems: ['farmaci', 'pharmacy'], canonicalRo: 'farmacia', canonicalEn: 'pharmacy' },
  { stems: ['medical', 'prim ajutor', 'first aid'], canonicalRo: 'punctul de prim ajutor', canonicalEn: 'first aid' },
  { stems: ['atm', 'bancomat'], canonicalRo: 'bancomatul', canonicalEn: 'ATM' },
  { stems: ['inchirier', 'rental'], canonicalRo: 'birourile de închirieri auto', canonicalEn: 'car rental desks' },
  { stems: ['salon', 'lounge', 'business lounge', 'vip'], canonicalRo: 'salonul business', canonicalEn: 'airport lounge' },
  { stems: ['posta', 'postal', 'post office'], canonicalRo: 'oficiul poștal', canonicalEn: 'post office' },
];

/**
 * Procedural questions about airport rules or availability that must NOT open a map.
 */
const PROCEDURAL_RULE_PATTERNS = [
  /\b(?:exista|avem|este vreo|is there|are there|do you have)\b/i,
  /\b(?:pot sa|am voie|can i|is it allowed|voie|reguli|rules|regulament)\b/i,
  /\b(?:ce se intampla|ce fac daca|what happens|what do i do)\b/i,
  /\b(?:cat costa|how much|taxa|fee|pret|price)\b/i,
];

const PROCEDURAL_STEMS = [
  'rugaciun', 'prayer', 'fumat', 'smok', 'dus', 'shower', 'dormi', 'sleep',
  'bagaj', 'lichid', 'viza', 'pasaport', 'drepturi', 'compens', 'document', 'copil', 'child'
];

export function isProceduralKnowledgeQuery(question: string): boolean {
  const norm = normalize(question);
  const toks = norm.split(' ');
  const hasTrigger = PROCEDURAL_RULE_PATTERNS.some(p => p.test(norm) || p.test(question));
  const hasStem = PROCEDURAL_STEMS.some(stem => toks.some(t => t.includes(stem)));
  return hasTrigger && hasStem;
}

export function isConfirmedMapDestination(destination: string | undefined): boolean {
  if (!destination || destination.trim().length < 2) return false;
  const norm = normalize(destination);
  const toks = norm.split(' ').filter(Boolean);
  return VALID_MAP_DESTINATIONS.some(p =>
    p.stems.some(stem => toks.some(tok => tok.includes(stem) || stem.includes(tok)))
  );
}

export type SanitizedToolCall = {
  name: string;
  arguments: Record<string, string>;
  sanitized: boolean;
  action: 'execute' | 'clarify' | 'block';
  reason?: string;
};

/**
 * Deterministically sanitizes model-proposed tool calls:
 *  1. Flight number: extracts from raw passenger question. If model modified/hallucinated,
 *     overwrites with the extracted raw flight number. If absent from message, forbids invention.
 *  2. Knowledge: enforces using the raw bounded user question instead of model rewriting.
 *  3. Map: verifies destination is a confirmed facility. Rejects converting procedural rules to map.
 */
export function sanitizeToolCall(
  toolName: string,
  rawArgs: Record<string, string>,
  userQuestion: string,
  context?: { flightNumber?: string }
): SanitizedToolCall {
  const args = { ...rawArgs };
  let sanitized = false;
  const rawFlight = extractFlightNumber(userQuestion);

  // 1. Flight Tools
  if (toolName.startsWith('get_')) {
    if (rawFlight) {
      if (args.flightNumber !== rawFlight) {
        args.flightNumber = rawFlight;
        sanitized = true;
      }
    } else {
      // No flight number in raw passenger question
      if (args.flightNumber) {
        // If passenger context has a flight and matches, keep it; otherwise model hallucinated a number
        if (context?.flightNumber && args.flightNumber === context.flightNumber) {
          args.flightNumber = context.flightNumber;
        } else {
          // Model invented a flight number not in the message: remove it
          delete args.flightNumber;
          sanitized = true;
        }
      }
    }
    return { name: toolName, arguments: args, sanitized, action: 'execute' };
  }

  // 2. Knowledge Retrieval Tool
  if (toolName === 'search_knowledge') {
    const rawBounded = userQuestion.trim().slice(0, 200);
    if (args.query !== rawBounded) {
      args.query = rawBounded;
      sanitized = true;
    }
    return { name: toolName, arguments: args, sanitized, action: 'execute' };
  }

  // 3. Airport Navigation Map Tool (Side Effect)
  if (toolName === 'open_airport_map') {
    // If the passenger actually asked a procedural knowledge question (e.g. prayer room rule / existence)
    if (isProceduralKnowledgeQuery(userQuestion)) {
      return {
        name: 'search_knowledge',
        arguments: { query: userQuestion.trim().slice(0, 200) },
        sanitized: true,
        action: 'execute',
        reason: 'procedural rule redirected to search_knowledge',
      };
    }

    if (!isConfirmedMapDestination(args.destination)) {
      return {
        name: toolName,
        arguments: args,
        sanitized: true,
        action: 'clarify',
        reason: 'unconfirmed destination for map side effect',
      };
    }

    return { name: toolName, arguments: args, sanitized, action: 'execute' };
  }

  // Other tools or none
  return { name: toolName, arguments: args, sanitized, action: 'execute' };
}
