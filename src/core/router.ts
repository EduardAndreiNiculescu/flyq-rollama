import { detectLang } from './prompt';
import type { Intent } from './types';
import { capabilityBoundary } from './capability';

/**
 * Deterministic, typo-tolerant intent router (RO + EN). It never "understands" language: it matches
 * normalized word stems with a small edit-distance allowance and returns every intent it finds,
 * ordered by where they appear in the question. The LLM is not consulted.
 */

export const normalize = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

function lev(a: string, b: string): number {
  const d: number[] = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = d[0];
    d[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = d[j];
      d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return d[b.length];
}

/**
 * Does token `tok` match stem `stem`? '=' prefix = exact word (or plural -s) only.
 * Otherwise: prefix match, or up to 1-2 typos when the first letter agrees (typos rarely change it),
 * which also keeps "date" from matching "gate".
 */
export function near(tok: string, stem: string): boolean {
  if (stem[0] === '=') return tok === stem.slice(1) || tok === `${stem.slice(1)}s`;
  // A prefix match is an inflection only if the extra tail is short: "unde" must not match "understand".
  if (tok.startsWith(stem)) return tok.length - stem.length <= (stem.length <= 4 ? 3 : 10);
  if (stem.length < 4 || tok[0] !== stem[0]) return false;
  const max = stem.length >= 7 ? 2 : 1;
  // Whole-token comparison when lengths are similar ("baia" ~ "baie", "wher" ~ "where").
  if (Math.abs(tok.length - stem.length) <= 2 && lev(tok, stem) <= max) return true;
  // Typo + inflection ("aterizzam" ~ "ateriz"): compare only a prefix, and only for long stems,
  // otherwise unrelated words match ("buletinul" ~ "bufet").
  if (stem.length >= 6) {
    for (const n of [stem.length - 1, stem.length, stem.length + 1]) {
      if (lev(tok.slice(0, n), stem) <= max) return true;
    }
  }
  return false;
}

type Hit = number; // index of the first matching token, or -1
const first = (toks: string[], stems: string[]): Hit => toks.findIndex((t) => stems.some((s) => near(t, s)));

// ---------- places the map can open ----------
const PLACES: { stems: string[]; ro: string; en: string }[] = [
  { stems: ['toalet', 'baie', 'baia', '=wc', 'toilet', 'restroom', 'bathroom', 'lavatory'], ro: 'toaleta', en: 'toilet' },
  { stems: ['iesire', '=exit'], ro: 'ieșirea', en: 'exit' },
  { stems: ['poart', '=gate'], ro: 'poarta mea', en: 'my gate' },
  { stems: ['securit', '=security'], ro: 'controlul de securitate', en: 'security control' },
  { stems: ['informati', '=information', '=info'], ro: 'ghișeul de informații', en: 'information desk' },
  { stems: ['cafenea', '=cafe', 'restaurant', 'manca', 'mananc', '=eat', '=food', 'mancare', 'bufet'], ro: 'restaurant sau cafenea', en: 'food and cafes' },
  { stems: ['parcar', '=parking', '=carpark'], ro: 'parcarea', en: 'car park' },
  { stems: ['=taxi', 'taxiur'], ro: 'taxiurile', en: 'taxis' },
  { stems: ['banda', 'bagaje', 'baggage', 'luggage'], ro: 'zona de bagaje', en: 'baggage claim' },
  { stems: ['check'], ro: 'check-in', en: 'check-in' },
  { stems: ['farmaci', '=pharmacy'], ro: 'farmacia', en: 'pharmacy' },
  { stems: ['medical', 'prim ajutor', 'first aid'], ro: 'punctul de prim ajutor', en: 'first aid' },
  { stems: ['=atm', 'bancomat'], ro: 'bancomatul', en: 'ATM' },
  { stems: ['inchirier', 'rental'], ro: 'birourile de închirieri auto', en: 'car rental desks' },
];
const NAV_STRONG = ['unde', 'where', 'harta', '=map', 'navig', 'ghid', 'direction'];
// Weak triggers are exact-match only (fuzzy "cat" ~ "caut" and "take" in "can I take liquids" caused false navigation).
// "cum ajung" / "how do I get to" / "take me" are handled by the phrase regex in navigation().
const NAV_WEAK = ['=arata', '=show', '=caut', '=looking', '=find', '=gasesc', '=duce', '=duc', '=duceti', '=point'];
const STOP = new Set(['e', 'este', 'se', 'afla', 'is', 'the', 'a', 'an', 'la', 'to', 'in', 'pe', 'pot', 'sa', 'imi', 'mi', 'my', 'me', 'o', 'un', 'de', 'si', 'and', 'nu', 'cum', 'how', 'do', 'i', 'get', 'can', 'you', 'find', 'show', 'arata', 'harta', 'map', 'on', 'te', 'rog']);

function navigation(toks: string[], text: string, lang: 'ro' | 'en'): { at: Hit; destination?: string } {
  const cumAjung = /\bcum (ajung|ajunge|ajungem|ma duc|merg)\b|\bhow (do|can) i (get|go)\b|\btake me\b/.test(text);
  const strong = first(toks, NAV_STRONG);
  const weak = cumAjung ? Math.max(0, text.split(' ').findIndex((t) => t === 'cum' || t === 'how' || t === 'take')) : first(toks, NAV_WEAK);
  const at = strong >= 0 ? strong : weak;
  if (at < 0) return { at: -1 };
  const place = PLACES.find((p) => first(toks, p.stems) >= 0);
  if (place) return { at, destination: lang === 'ro' ? place.ro : place.en };
  if (strong < 0) return { at: -1 }; // weak trigger without a known place: not a navigation request
  // Unknown place: only for "where is X" / "unde este X", and never when X is the passenger's plane or flight.
  if (!/\b(unde|where) (e|este|se afla|is|are)\b/.test(text)) return { at: -1 };
  const after = toks.slice(at + 1).filter((t) => !STOP.has(t)).slice(0, 4);
  if (after.some((t) => first([t], FLIGHT_NOUN) >= 0)) return { at: -1 };
  const rest = after.join(' ').slice(0, 64);
  return { at, destination: rest || undefined };
}

// ---------- flight questions ----------
const FLIGHT_NOUN = ['zbor', 'avion', '=flight', '=plane', 'aeronav', 'aircraft'];
const FLIGHT_STRONG = ['ateriz', '=land', '=lands', '=landing', 'sosir', 'soseste', 'arriv', 'decol', '=departure', '=departs', '=departing', '=takeoff', 'durat', 'dureaz', 'intarzi', '=delay', 'delayed', 'anulat', 'cancel', '=status', 'schedule', 'zboar', '=fly', '=flying', 'altitud', 'position'];
const FLIGHT_WEAK = ['ajunge', 'ajung', 'plec', 'pleac', '=leave', '=leaves', '=gate', 'poart', '=cand', '=when', 'time'];
// Airline code + number: RO123, W61234, U21234, TAR123, DEMO123. Not COVID19, B12 (a gate) or MP3.
const FLIGHT_NO = /\b([A-Z]{2}\d{2,4}|[A-Z]\d\d{3,4}|\d[A-Z]\d{3,4}|[A-Z]{3}\d{2,4}|DEMO\d{1,4})\b/;
const GATE_Q = /\b(la ce|care e|ce|spune[ -]?imi|spune[ -]?mi|spune) poart|\bwhich gate\b|\bwhat gate\b|\bwhat is the gate\b|\bgate (number|for|been announced)|\bnumar(ul|ul portii)? poart|\bnumarul portii\b|\btell me my gate\b|\bwhere (?:(?:do|will) )?i board\b|\bunde imbarc\b|\bpoarta (de imbarcare|pentru|mea)\b|\bafisat poarta\b|^\s*((si|și|and|dar|what about) )?(the |my )?(poarta|gate)\s*[?!.]*\s*$/;
const REMAINING = /\bcat (mai|timp mai)\b|\bin cat timp\b|\bcate minute mai sunt\b|\bhow (long|much)\b.*\b(until|left|remain|more|to go)\b|\balmost there\b|\bcountdown\b|\btime (left|remaining)\b|\bpana (la )?(aterizar|sosir|aterizam|ajungem|ajunge|imbarcare)|\buntil (we |it |the )?(land|arriv|board)/;

// "In cat timp ajungem?" has no flight noun but is unambiguous about the trip.
const TRIP_REMAINING = /\bin cat timp (ajungem|aterizam|ajunge|ateriza)\b|\bcate minute mai sunt pana la imbarcare\b|\b(?:are we )?almost there\b|\bhow long to go\b|\bhow long (until|before) (we|it) (land|arrive)/;
const WHERE_IS_FLIGHT = /\b(where is|unde e|unde este) (my |the |meu |avionul|zborul)/;
const FLIGHT_INFO = /\b(flight number|numarul (de )?zbor|numarul zborului)/;

function flight(toks: string[], text: string): { at: Hit; remaining: boolean } {
  const noun = first(toks, FLIGHT_NOUN);
  const strong = first(toks, FLIGHT_STRONG);
  const weak = first(toks, FLIGHT_WEAK);
  const gate = GATE_Q.test(text) || (WHERE_IS_FLIGHT.test(text) && noun >= 0) || FLIGHT_INFO.test(text);
  const hasNo = FLIGHT_NO.test(text.toUpperCase());
  const trip = TRIP_REMAINING.test(text);
  const ok = gate || trip || strong >= 0 || hasNo || (noun >= 0 && weak >= 0);
  if (!ok) return { at: -1, remaining: false };
  const at = [noun, strong, gate || trip ? 0 : -1, weak].filter((i) => i >= 0).sort((a, b) => a - b)[0] ?? 0;
  return { at, remaining: REMAINING.test(text) && !gate };
}

// ---------- the rest ----------
const BAGGAGE = ['bagaj', 'valiz', '=bag', '=bags', 'baggage', 'luggage', 'suitcase', 'geanta', '=kg', 'kilo', '=cabin', 'cabina'];
const DOCS = ['pasaport', 'passport', 'buletin', '=id', 'viza', '=visa', 'identitate', 'document', 'identity'];
const PROCEDURE = ['securit', '=security', 'imbarc', 'boarding', '=board', 'lichid', 'liquid', 'control', '=checkin', '=check', 'compens', 'drept', 'entitled', 'bebelu', 'infant', 'pisic', 'animal', '=pet', 'scaun', 'wheelchair', 'rotile', 'pregnan', 'restriction', 'conexiun', 'legatur', 'miss', 'early'];
const DEST_INFO = ['destinati', 'destination'];

/** All intents found in a question, earliest first. Never empty: falls back to GENERAL_QUESTION. */
export function routeIntents(question: string): Intent[] {
  const text = normalize(question);
  const toks = text.split(' ').filter(Boolean);
  const lang = detectLang(question);
  const found: { at: number; intent: Intent }[] = [];
  const fn = question.toUpperCase().match(FLIGHT_NO)?.[1];

  const fl = flight(toks, text);
  const nav = navigation(toks, text, lang);
  // "Where is my gate?" is navigation, "which gate is my flight at?" is flight data.
  const isGateQuestion = GATE_Q.test(text);

  if (fl.at >= 0) {
    found.push({ at: fl.at, intent: { intent: fl.remaining ? 'GET_FLIGHT_TIME_REMAINING' : 'GET_FLIGHT_DETAILS', args: fn ? { flightNumber: fn } : {} } });
  }
  if (nav.at >= 0 && !isGateQuestion) {
    found.push({ at: nav.at, intent: { intent: 'OPEN_AIRPORT_MAP', args: nav.destination ? { destination: nav.destination } : {} } });
  }
  if (REMAINING.test(text) && fl.at < 0 && /\b(mai|until|left|remain)\b/.test(text) && first(toks, ['ateriz', 'ajung', '=land']) >= 0) {
    found.push({ at: 0, intent: { intent: 'GET_FLIGHT_TIME_REMAINING', args: fn ? { flightNumber: fn } : {} } });
  }
  const other: [string[], Intent['intent']][] = [
    [BAGGAGE, 'GET_BAGGAGE_GUIDANCE'],
    [DOCS, 'GET_TRAVEL_DOCUMENT_GUIDANCE'],
    [PROCEDURE, 'LOOKUP_AIRPORT_PROCEDURE'],
    [DEST_INFO, 'GET_DESTINATION_INFORMATION'],
  ];
  for (const [stems, name] of other) {
    const at = first(toks, stems);
    if (at >= 0) found.push({ at, intent: { intent: name, args: {} } });
  }
  // A navigation request already covers its own place word ("security", "baggage"): skip duplicate guidance.
  const filtered = nav.at >= 0 && nav.destination && !isGateQuestion
    ? found.filter((f) => f.intent.intent === 'OPEN_AIRPORT_MAP' || f.intent.intent.startsWith('GET_FLIGHT') || f.at < nav.at)
    : found;
  if (filtered.length === 0) return [{ intent: 'GENERAL_QUESTION', args: {} }];
  return filtered.sort((a, b) => a.at - b.at).map((f) => f.intent);
}

/** Primary intent (backwards compatible). */
export const routeIntent = (question: string): Intent => routeIntents(question)[0];

export type RouteAction = 'execute' | 'clarify' | 'model';
export type RouteCandidate = {
  intent: Intent['intent'];
  tool: 'get_flight_details' | 'get_gate' | 'get_time_remaining' | 'get_live_tracking' | 'search_knowledge' | 'open_airport_map' | null;
  args: Record<string, string>;
  score: number;
  evidence: string[];
  sideEffect: boolean;
};
export type RouteContext = { previous?: Intent[]; flightNumber?: string };
export type RouteDecision = {
  action: RouteAction;
  candidates: RouteCandidate[];
  confidence: number;
  margin: number;
  evidence: string[];
  entities: { flightNumber?: string; destination?: string };
  reason: string;
};

const INJECTION = /\b(ignore|forget|system|developer|prompt|instructions?|ignora|uita|sistem|instructiuni|reguli)\b/;
const TRACKING = /\b(unde (?:e|este) (?:avionul|aeronava)|where is (?:my |the )?(?:plane|aircraft)|poziti(?:a|e)|position|altitudine|altitude|zboara acum|flying over|live tracking)\b/;
const GATE_DATA = /\b(la ce|care|ce|which|what) (?:numar(?:ul)? )?(?:poart|gate)|\b(?:poarta|gate) (?:mea|number|for)\b|\bwhere do i board\b|\bunde imbarc\b/;
const EXCLUDE_GATE = /\b(?:nu ma intereseaza|fara|exceptand) (?:poarta|gate)\b|\b(?:not|anything but) (?:the )?gate\b/;
const EXCLUDE_TRACKING = /\b(?:nu ma intereseaza|fara) (?:pozitia|unde e avionul)\b|\bnot (?:the )?(?:position|tracking)\b/;
const FOLLOW_UP = /^(?:si|și|and|dar|but|what about|iar)\b/;
const KNOWLEDGE_FORCE = /\b(compens|despagub|entitled|drepturi|rights|ce urmeaza|what do i do|how early|cat de devreme|bebelu|infant|pisic|pet|wheelchair|scaun cu rotile|pregnan|restrictions?|miss(?:ed)? (?:my |the )?flight|pierdut legatura|lost (?:my )?connection)\b/;
const DURATION_FORCE = /\bhow many hours (?:is|does) (?:the )?(?:trip|flight)|\bcat(?:e)? ore (?:face|dureaza|este) (?:drumul|zborul)/;

function candidateFor(i: Intent, text: string): RouteCandidate {
  let tool: RouteCandidate['tool'] = null;
  let score = 0.88;
  const evidence: string[] = [`intent:${i.intent}`];
  if (i.intent === 'GET_FLIGHT_TIME_REMAINING') {
    tool = 'get_time_remaining'; score = 0.97; evidence.push('remaining');
  } else if (i.intent === 'GET_FLIGHT_DETAILS') {
    if (TRACKING.test(text) && !EXCLUDE_TRACKING.test(text)) {
      tool = 'get_live_tracking'; score = 0.97; evidence.push('tracking');
    } else if (GATE_DATA.test(text) && !EXCLUDE_GATE.test(text)) {
      tool = 'get_gate'; score = 0.98; evidence.push('gate');
    } else {
      tool = 'get_flight_details'; score = 0.91; evidence.push('flight');
    }
  } else if (i.intent === 'OPEN_AIRPORT_MAP') {
    tool = 'open_airport_map'; score = i.args.destination ? 0.98 : 0.68; evidence.push(i.args.destination ? 'destination' : 'missing-destination');
  } else if (['GET_BAGGAGE_GUIDANCE', 'GET_TRAVEL_DOCUMENT_GUIDANCE', 'LOOKUP_AIRPORT_PROCEDURE', 'GET_DESTINATION_INFORMATION'].includes(i.intent)) {
    tool = 'search_knowledge'; score = 0.92; evidence.push('passenger-knowledge');
  } else {
    score = 0.2; evidence.push('general');
  }
  return { intent: i.intent, tool, args: i.args, score, evidence, sideEffect: tool === 'open_airport_map' };
}

/**
 * Explainable routing decision used by the zero-model path and by small models to see only plausible tools.
 * It is deliberately conservative: uncertain, steered or underspecified requests remain model/clarification work.
 */
export function routeDecision(question: string, context: RouteContext = {}): RouteDecision {
  const text = normalize(question);
  const boundary = capabilityBoundary(question);
  if (boundary) {
    return {
      action: 'clarify', candidates: [], confidence: 1, margin: 1,
      evidence: [boundary], entities: {}, reason: 'outside supported capabilities',
    };
  }
  const injected = INJECTION.test(text);
  let intents = routeIntents(question);
  const evidence: string[] = [];
  if (injected) evidence.push('possible-injection');
  if (KNOWLEDGE_FORCE.test(text)) {
    intents = [{ intent: 'LOOKUP_AIRPORT_PROCEDURE', args: {} }];
    evidence.push('policy-question');
  } else if (DURATION_FORCE.test(text)) {
    intents = [{ intent: 'GET_FLIGHT_DETAILS', args: {} }];
    evidence.push('duration-question');
  }
  if (intents.length === 1 && intents[0].intent === 'GENERAL_QUESTION' && context.previous?.length && FOLLOW_UP.test(text)) {
    intents = context.previous.map(i => ({ intent: i.intent, args: { ...i.args } }));
    evidence.push('conversation-context');
  }
  let candidates = intents.map(i => candidateFor(i, text)).filter(c => c.tool !== null);
  if (!candidates.length && /\b(harta|map)\b/.test(text)) {
    candidates = [{ intent: 'OPEN_AIRPORT_MAP', tool: 'open_airport_map', args: {}, score: 0.68, evidence: ['map', 'missing-destination'], sideEffect: true }];
  }
  if (context.flightNumber) {
    const selectedFlight = context.flightNumber;
    candidates = candidates.map(c => c.tool?.startsWith('get_') && !c.args.flightNumber
      ? { ...c, args: { ...c.args, flightNumber: selectedFlight }, evidence: [...c.evidence, 'context-flight'] }
      : c);
  }
  const unique = new Map<string, RouteCandidate>();
  for (const c of candidates) {
    const key = `${c.tool}:${JSON.stringify(c.args)}`;
    const old = unique.get(key);
    if (!old || c.score > old.score) unique.set(key, c);
  }
  candidates = [...unique.values()].sort((a, b) => b.score - a.score);
  const confidence = candidates[0]?.score ?? 0;
  const margin = confidence - (candidates[1]?.score ?? 0);
  const entities: RouteDecision['entities'] = {};
  const flightNumber = candidates.map(c => c.args.flightNumber).find(Boolean) ?? context.flightNumber;
  const destination = candidates.map(c => c.args.destination).find(Boolean);
  if (flightNumber) entities.flightNumber = flightNumber;
  if (destination) entities.destination = destination;
  evidence.push(...candidates.flatMap(c => c.evidence));

  if (injected) return { action: 'model', candidates: [], confidence: 0, margin: 0, evidence, entities, reason: 'steered request' };
  if (!candidates.length) return { action: 'model', candidates, confidence, margin, evidence, entities, reason: 'no domain intent' };
  const underspecifiedSideEffect = candidates.some(c => c.sideEffect && (!c.args.destination || c.score < 0.98));
  if (underspecifiedSideEffect) return { action: 'clarify', candidates, confidence, margin, evidence, entities, reason: 'side effect needs a clear destination' };
  if (candidates.every(c => c.score >= 0.9) && (candidates.length > 1 || margin >= 0.18 || confidence >= 0.97)) {
    return { action: 'execute', candidates, confidence, margin, evidence, entities, reason: candidates.length > 1 ? 'multiple clear intents' : 'clear intent' };
  }
  if (confidence >= 0.62) return { action: 'clarify', candidates, confidence, margin, evidence, entities, reason: 'intent is plausible but ambiguous' };
  return { action: 'model', candidates, confidence, margin, evidence, entities, reason: 'low confidence' };
}

/** Every word the router reacts to (for the spell-corrector's lexicon). Exact-match markers removed. */
export const ROUTER_WORDS: string[] = [
  ...NAV_STRONG, ...NAV_WEAK, ...FLIGHT_NOUN, ...FLIGHT_STRONG, ...FLIGHT_WEAK, ...BAGGAGE, ...DOCS, ...PROCEDURE, ...DEST_INFO,
  ...PLACES.flatMap((p) => [...p.stems, ...normalize(p.ro).split(' '), ...normalize(p.en).split(' ')]),
].map((w) => w.replace(/^=/, '')).filter((w) => w.length >= 3);
