import type { Language } from '../i18n';

// Logica pură a ecranului Asistent (etichete, sugestii, carduri, vechimea datelor). Fără React, ca să fie testabilă.

type Pair = { ro: string; en: string };
const pick = (p: Pair, lang: Language) => p[lang];

const STEP: Record<string, Pair> = {
  get_flight_details: { ro: 'Citesc detaliile zborului', en: 'Reading the flight details' },
  get_gate: { ro: 'Verific poarta', en: 'Checking the gate' },
  get_time_remaining: { ro: 'Calculez timpul rămas', en: 'Working out the time left' },
  get_live_tracking: { ro: 'Caut poziția avionului', en: 'Looking up the aircraft position' },
  search_knowledge: { ro: 'Caut în ghidul pentru pasageri', en: 'Searching the passenger guide' },
  open_airport_map: { ro: 'Pregătesc harta', en: 'Preparing the map' },
};
const UNDERSTAND: Pair = { ro: 'Înțeleg întrebarea', en: 'Understanding the question' };
const WRITING: Pair = { ro: 'Scriu răspunsul', en: 'Writing the answer' };

export type StepState = 'pending' | 'run' | 'done';
export type Step = { label: string; state: StepState };

export const stepLabel = (tool: string, lang: Language) => (STEP[tool] ? pick(STEP[tool], lang) : lang === 'ro' ? 'Folosesc o unealtă' : 'Using a tool');

/** Steps shown while the assistant works. `tools` are the tools the model really called, in order. */
export function buildSteps(tools: { name: string; done: boolean }[], writing: boolean, lang: Language): Step[] {
  const steps: Step[] = [{ label: pick(UNDERSTAND, lang), state: tools.length || writing ? 'done' : 'run' }];
  for (const t of tools) steps.push({ label: stepLabel(t.name, lang), state: t.done ? 'done' : 'run' });
  steps.push({ label: pick(WRITING, lang), state: writing ? 'run' : 'pending' });
  return steps;
}

/** Without a real tool loop (demo answers, laptop model) the steps are only a guess from the words of the question. */
export function guessTools(question: string): string[] {
  const q = question.toLowerCase();
  if (/(poart|gate|board|îmbarc|imbarc)/.test(q)) return ['get_gate'];
  if (/(ateriz|land|ajung|durat|cât mai|cat mai|how long)/.test(q)) return ['get_time_remaining'];
  if (/(unde e|unde este|where is|hart|toalet|farmac|bancomat|cafea)/.test(q)) return ['open_airport_map'];
  if (/(lichid|bagaj|pașaport|pasaport|document|regul|liquid|baggage|passport|power ?bank|securit|security)/.test(q)) return ['search_knowledge'];
  return ['get_flight_details'];
}

export function splitAnswer(text: string): { lead: string; rest: string } {
  const t = text.trim();
  if (t.length <= 220) return { lead: t, rest: '' };
  const sentences = t.split(/(?<=[.!?])\s+/);
  if (sentences.length <= 2) return { lead: t, rest: '' };
  let lead = sentences[0];
  if (lead.length < 80) lead = `${lead} ${sentences[1]}`;
  const rest = t.slice(lead.length).trim();
  return rest ? { lead, rest } : { lead: t, rest: '' };
}

const SLASH: { cmd: string; ro: string; en: string }[] = [
  { cmd: '/poarta', ro: 'La ce poartă sunt?', en: 'What gate am I at?' },
  { cmd: '/ora', ro: 'Când aterizez?', en: 'When do we land?' },
  { cmd: '/harta', ro: 'Unde este toaleta?', en: 'Where is the restroom?' },
  { cmd: '/regula', ro: 'Ce pot lua în bagajul de mână?', en: 'What can I take in my cabin bag?' },
  { cmd: '/intarziere', ro: 'Am întârziere?', en: 'Is my flight delayed?' },
];
export const slashMatches = (input: string, lang: Language) =>
  input.startsWith('/') ? SLASH.filter(s => s.cmd.startsWith(input.toLowerCase())).map(s => ({ cmd: s.cmd, text: s[lang] })) : [];
export const expandSlash = (input: string, lang: Language): string | null => {
  const hit = SLASH.find(s => s.cmd === input.trim().toLowerCase());
  return hit ? hit[lang] : null;
};

/** Suggestions after an answer, from the tool that produced it. */
export function followUps(tools: string[], lang: Language, fallback: string[]): string[] {
  const last = tools[tools.length - 1];
  const t = (ro: string[], en: string[]) => (lang === 'ro' ? ro : en);
  switch (last) {
    case 'get_gate':
      return t(['Când începe îmbarcarea?', 'Am întârziere?', 'Unde este poarta pe hartă?'], ['When does boarding start?', 'Is my flight delayed?', 'Show the gate on the map']);
    case 'get_flight_details':
    case 'get_time_remaining':
      return t(['La ce poartă sunt?', 'Am întârziere?', 'Cât durează zborul?'], ['What gate am I at?', 'Is my flight delayed?', 'How long is the flight?']);
    case 'get_live_tracking':
      return t(['Când aterizez?', 'Cât mai e până aterizăm?'], ['When do we land?', 'How long until we land?']);
    case 'search_knowledge':
      return t(['Pot lua lichide?', 'Ce documente îmi trebuie?', 'Ce fac dacă pierd zborul?'], ['Can I take liquids?', 'What documents do I need?', 'What if I miss my flight?']);
    case 'open_airport_map':
      return t(['Unde este poarta mea?', 'Unde pot mânca?'], ['Where is my gate?', 'Where can I eat?']);
    default:
      return fallback;
  }
}

export type Freshness = { text: string; level: 'fresh' | 'old' | 'unknown' };
/** How old the data behind an answer is. Null `updated` = the source gave no time. */
export function freshness(updated: string | null | undefined, now: Date, lang: Language): Freshness {
  const ms = updated ? Date.parse(updated) : NaN;
  if (Number.isNaN(ms)) return { text: lang === 'ro' ? 'oră de actualizare necunoscută' : 'update time unknown', level: 'unknown' };
  const min = Math.max(0, Math.round((now.getTime() - ms) / 60_000));
  const age = min < 1 ? (lang === 'ro' ? 'chiar acum' : 'just now') : min < 60 ? (lang === 'ro' ? `acum ${min} min` : `${min} min ago`) : lang === 'ro' ? `acum ${Math.round(min / 60)} h` : `${Math.round(min / 60)} h ago`;
  return { text: lang === 'ro' ? `actualizat ${age}` : `updated ${age}`, level: min <= 15 ? 'fresh' : 'old' };
}

export type Facts = { gate?: string | null; boarding?: string; departure?: string; arrival?: string; remaining?: string };
export type Card = { kind: 'gate' | 'boarding' | 'departure' | 'arrival' | 'remaining'; label: string; value: string; note?: string };

/** Fact cards under an answer. The values come from the flight data, never from the model's wording. */
export function buildCards(tools: string[], facts: Facts, lang: Language): Card[] {
  const ro = lang === 'ro';
  const out: Card[] = [];
  const add = (c: Card) => out.some(x => x.kind === c.kind) || out.push(c);
  for (const tool of tools) {
    if (tool === 'get_gate') {
      const known = !!facts.gate && facts.gate !== '—';
      add({ kind: 'gate', label: ro ? 'Poarta' : 'Gate', value: known ? facts.gate! : '—', note: known ? (ro ? 'confirmată' : 'confirmed') : ro ? 'neconfirmată' : 'not confirmed' });
      if (facts.boarding) add({ kind: 'boarding', label: ro ? 'Îmbarcare' : 'Boarding', value: facts.boarding, note: ro ? 'estimată' : 'estimated' });
    }
    if (tool === 'get_flight_details') {
      if (facts.departure) add({ kind: 'departure', label: ro ? 'Decolare' : 'Departure', value: facts.departure });
      if (facts.arrival) add({ kind: 'arrival', label: ro ? 'Aterizare' : 'Arrival', value: facts.arrival });
    }
    if (tool === 'get_time_remaining' && facts.remaining) add({ kind: 'remaining', label: ro ? 'Timp rămas' : 'Time left', value: facts.remaining });
  }
  return out.slice(0, 3);
}

export type Countdown = { minutes: number; kind: 'boarding' | 'departure' | 'arrival' | 'done' };
/** What the big number on the flight card counts down to: boarding, then departure, then arrival. */
export function heroCountdown(nowMs: number, t: { boarding: number; departure: number; arrival: number }): Countdown {
  const min = (ms: number) => Math.max(0, Math.round((ms - nowMs) / 60_000));
  if (nowMs < t.boarding) return { minutes: min(t.boarding), kind: 'boarding' };
  if (nowMs < t.departure) return { minutes: min(t.departure), kind: 'departure' };
  if (nowMs < t.arrival) return { minutes: min(t.arrival), kind: 'arrival' };
  return { minutes: 0, kind: 'done' };
}

/** "84 min" under 2 h, "2 h 05 min" above; the card shows hours only when the number would be unwieldy. */
export function countdownText(minutes: number): { value: string; unit: string } {
  if (minutes < 120) return { value: String(minutes), unit: 'min' };
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return { value: `${h}:${String(m).padStart(2, '0')}`, unit: 'h' };
}

export type StatusTone = 'good' | 'warn' | 'neutral';
/** Status pill of the flight card. Only states the data supports: no delay figure means "scheduled", never "on time". */
export function statusPill(delayMin: number | null | undefined, hasLiveData: boolean, lang: Language): { text: string; tone: StatusTone } {
  const ro = lang === 'ro';
  if (!hasLiveData) return { text: ro ? 'Programat' : 'Scheduled', tone: 'neutral' };
  if (typeof delayMin === 'number' && delayMin >= 15) return { text: ro ? `Întârziere ${delayMin} min` : `Delayed ${delayMin} min`, tone: 'warn' };
  return { text: ro ? 'La timp' : 'On time', tone: 'good' };
}

export const sourceChip =(tools: string[], lang: Language): string | null => (tools.includes('search_knowledge') ? (lang === 'ro' ? 'Ghid pasageri · offline' : 'Passenger guide · offline') : null);
