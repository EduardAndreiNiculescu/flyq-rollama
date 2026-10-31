/**
 * Tier-1 deterministic rules, ported one to one from the training pipeline's benchmark
 * (finetune/run_stress_1000_benchmark.py: check_capability_boundary and try_fast_path).
 *
 * IMPORTANT: these patterns were written while looking at the 1000-question stress set (several are exact phrases from it, e.g.
 * "frunze are un stejar"). On that set they are 100% correct by construction; on real passenger questions their quality is unknown.
 * `BENCHMARK_EQUIVALENT` keeps them exactly as the Python code has them so the two implementations can be compared question by question.
 * The app's runtime uses them with extra guards (see capability.ts and fastPath.ts), and without the bare "bilet/bilete" pattern.
 */
export const stripDiacritics = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
const prep = (query: string) => stripDiacritics(query.toLowerCase()).trim();

const TRIVIA = [
  /\b(scaun|scaune|degete|palma|banc|poezie|gluma|bancuri|zodie|horoscop|vremea|presedinte|capitala|reteta|ciorba|masina)\b/,
  /\b(de cate ori|cat de des|statistici|se lovesc|se prabusesc|accidente|accident)\b/,
  /\b(inmultit|cat fac|cap sau pajura|nor pe cer|crocodil|musca de otet|mamaliga|sensul vietii|frunze are un stejar|litri de motorina)\b/,
];
/** Purchases and bookings the app cannot make. The bare "bilet/bilete" word is kept apart: it also appears in legitimate questions about the passenger's own ticket. */
const TRANSACTIONS = [/\b(cumpara|cumpar|rezerva|hotel|hoteluri|taxi|uber|bolt)\b/, /\b(check[- ]?in|schimba-mi biletul|anuleaza rezervarea|plateste[- ]mi taxa|upgrade la clasa|parola de la wifi)\b/];
const BARE_TICKET = /\b(bilet|bilete)\b/;

/** `strict` = exactly the Python rule (includes the bare ticket pattern). */
/** "check-in" alone also appears in factual questions ("when does check-in open?"); the app's own action pattern (capability.ts) covers "do my check-in". */
const CHECKIN = /(^|[^a-z])check[- ]?in([^a-z]|$)/g;

/** Words of the benchmark's trivia riddles that are ordinary in real questions: "ce scaun am?", "scaun cu rotile", "unde e parcarea pentru masina", "cat de des sunt autobuze". Ignored at runtime, kept in `strict`. */
const RUNTIME_OK = /\b(scaun|scaune|masina|accident|accidente|cat de des)\b/g;

export function tier1Capability(query: string, strict = false): 'unsupported-capability' | 'out-of-scope' | null {
  const q0 = prep(query);
  const q = strict ? q0 : q0.replace(CHECKIN, ' ').replace(RUNTIME_OK, ' ');
  if (TRANSACTIONS.some((re) => re.test(q)) || (strict && BARE_TICKET.test(q))) return 'unsupported-capability';
  if (TRIVIA.some((re) => re.test(q))) return 'out-of-scope';
  return null;
}

export type Tier1Tool = 'get_gate' | 'get_time_remaining' | 'open_airport_map' | 'search_knowledge' | 'get_live_tracking' | 'get_flight_details';

/** The Python try_fast_path, rule by rule and in the same order. Returns the tool name, or null when the model has to decide. */
export function tier1FastTool(query: string): Tier1Tool | null {
  const q = prep(query);
  if (/\b(?:poarta mea|poarta de imbarcare|arata[- ]mi poarta|unde gasesc poarta|la ce poarta|care e poarta|ce poarta am)\b/.test(q)) {
    return /\b(?:cand|la cat|in cat timp)\b/.test(q) ? 'get_time_remaining' : 'get_gate';
  }
  if (/\b(?:mai am (?:timp|vreme)|in cat timp (?:plecam|decolam|incepe)|cat mai e pana|cat a mai ramas|cand trebuie sa fiu la poarta|la cat incepe boarding|mai e mult pana la zbor|cat mai am de asteptat)\b/.test(q)) return 'get_time_remaining';
  if (/\b(?:unde pot (?:bea|manca|gasi|schimba)|unde e (?:baia|toaleta|farmacia|duty free|zona de fumat|restaurante|casa de schimb)|harta terminalului)\b/.test(q)) return 'open_airport_map';
  if (/\b(?:cati bani primesc despagubire|dreptul la compensatie|despagubiri primesc|refuza sa[- ]mi plateasca|crema de fata|pasta de dinti|trolerul a sosit rupt|formular completez|pierdut buletinul|pierdut pasaportul|am voie cu (?:pisica|cainele|foarfeca|parfum|laptopul|bricheta)|puse in punga|bateria externa|powerbank in cala|termen limita.*reclamatie)\b/.test(q)) return 'search_knowledge';
  if (/\b(?:harta radar|radar live|pe unde zboara aeronava|pozitia avionului pe harta|la ce altitudine|unde se afla zborul .* in aer|urmareste zborul .* in timp real|a plecat avionul spre|a decolat aeronava)\b/.test(q)) return 'get_live_tracking';
  if (/\b(?:la ce ora (?:pleaca|aterizam|decolam)|s[- ]a anulat cursa|intarzierea la zborul|cat dureaza zborul|cand decolam spre|statusul cursei|e la timp zborul)\b/.test(q)) return 'get_flight_details';
  return null;
}
