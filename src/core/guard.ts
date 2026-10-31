/**
 * Runtime guard: rejects model answers that state things the app cannot know. Pure, offline, no deps.
 * It is a coarse safety net (regexes + set membership), not a proof of correctness: it catches
 * invented numbers/gates, live-status claims, false identity claims and system-prompt leaks.
 * It cannot catch a wrong-but-present number (e.g. the departure time given as the arrival time).
 */
export type Lang = 'ro' | 'en';
export type ViolationKind = 'number' | 'gate' | 'status_claim' | 'persona' | 'leak';
export type Violation = { kind: ViolationKind; detail: string };

/** Lowercase, no diacritics, typographic apostrophes folded. Combining marks removed via NFD. */
const plain = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[\u2019\u2018]/g, "'");

const unzero = (n: string) => n.replace(/^0+(?=\d)/, '');

/**
 * Numbers: every digit sequence in the answer must occur in the context (as digits, "14:10" -> 14, 10).
 * Harmless and therefore ignored: list numbering at the start of a line ("1." / "2)"), because the
 * model numbers its own steps. Everything else is checked, including years/dates, so "2h 30min" with
 * no 30 in the context is flagged (a derived sum would be too; we prefer false alarms over invented times).
 */
function numberViolations(answer: string, context: string): Violation[] {
  const allowed = new Set((context.match(/\d+/g) ?? []).map(unzero));
  const body = answer.replace(/^[ \t]*[(]?\d{1,2}[.)][ \t]+/gm, '').replace(GATE_RE, ' ');
  const bad = [...new Set((body.match(/\d+/g) ?? []).map(unzero).filter((n) => !allowed.has(n)))];
  return bad.map((n) => ({ kind: 'number', detail: n }));
}

/** Gate-like codes: one letter + 1-2 digits as a whole word (A1, B12). */
const GATE_RE = /\b[a-z]\d{1,2}\b/gi;
function gateViolations(answer: string, context: string): Violation[] {
  const known = new Set(plain(context).match(GATE_RE) ?? []);
  const bad = new Set((plain(answer).match(GATE_RE) ?? []).filter((g) => !known.has(g)));
  return [...bad].map((g) => ({ kind: 'gate', detail: g.toUpperCase() }));
}

/** Words that, shortly before a claim, turn it into a refusal, condition or question. */
const HEDGE_RE = /n't|\b(nu|not|never|cannot|fara|without|daca|if|whether|cand|when|once|until|pana|dupa ce|after)\b/;

/** Claims about live/official state. The app only has a schedule, so asserting these is invented. */
const STATUS_CLAIMS: RegExp[] = [
  /\ba (decolat|aterizat|ajuns|plecat)\b/, /\bau (decolat|aterizat)\b/,
  /\b(este|e|a fost|fost) (anulat|anulata|intarziat|intarziata|redirectionat)\b/, /\b(este|e) la timp\b/, /\bzboru?l? (a )?(decolat|aterizat)\b/,
  /\b(has|have|had) (already )?(landed|taken off|departed|arrived)\b/, /\bhas (been )?(cancel+ed|delayed|diverted)\b/,
  /\b(is|was|been|will be) (on time|cancel+ed|delayed|diverted|boarding)\b/, /\bis (now )?(landing|airborne)\b/,
  /\b(confirmat|confirmata) (oficial|de companie)\b/, /\bofficially (confirmed|announced)\b/, /\bconfirmat oficial\b/,
  /\bse imbarca (acum|la)\b/, /\bare loc imbarcarea\b/,
];
/** A claim stands only if a status/tracking line of the context itself says it (not the user's question). */
function contextStatusLines(context: string): string {
  return plain(context).split('\n').filter((l) => /^(status|live tracking|identity|on ground|position)/.test(l.trim())).join('\n');
}
function statusViolations(answer: string, context: string): Violation[] {
  const supported = contextStatusLines(context);
  const out: Violation[] = [];
  for (const sentence of plain(answer).split(/[.!?\n;]+/)) {
    for (const re of STATUS_CLAIMS) {
      const m = re.exec(sentence);
      if (!m) continue;
      if (HEDGE_RE.test(sentence.slice(Math.max(0, m.index - 45), m.index))) continue;
      if (re.test(supported)) continue;
      out.push({ kind: 'status_claim', detail: m[0] });
    }
  }
  return out;
}

/** Identity claims. A negation right before ("nu sunt avocat", "I am not a lawyer") is the correct answer. */
const PERSONA = /\b(sunt|suntem|i am|i'm|we are|as your|ca si|in calitate de)\s+(un |o |an |a |your |the |de )?(avocat\w*|jurist\w*|lawyer|attorney|solicitor|angajat\w*|reprezentant\w*|agent\w*|employee|representative|staff member|pilot\w*|ofiter\w*|politist\w*|officer|border (guard|officer)|custom\w*|vamesul|vames)\b/;
const PERSONA_FULL = /\b(sunt|i am|i'm)\s+(un |o |an |a |de la |from )?(.{0,25}\b)?(angajat|angajata|employee|reprezentant|representative|ofiter|politist|officer|avocat|lawyer|jurist)\b/;
function personaViolations(answer: string): Violation[] {
  const out: Violation[] = [];
  for (const sentence of plain(answer).split(/[.!?\n;]+/)) {
    for (const re of [PERSONA, PERSONA_FULL]) {
      const m = re.exec(sentence);
      if (!m || HEDGE_RE.test(sentence.slice(Math.max(0, m.index - 25), m.index + 12))) continue;
      out.push({ kind: 'persona', detail: m[0].trim() });
      break;
    }
  }
  return out;
}

/** Put between messages when a conversation is flattened into one context string (see guardToolAnswer). */
export const MESSAGE_SEP = '\n\u0001\n';

/** Leak: any run of 8 consecutive words from the system prompt's rules reappearing in the answer. */
const RUN = 8;
const words = (s: string) => plain(s).replace(/[^a-z0-9' ]+/g, ' ').split(/\s+/).filter(Boolean);
function leakViolations(answer: string, context: string): Violation[] {
  const pc = plain(context);
  const at = pc.indexOf('you are flightflow');
  if (at < 0) return [];
  // The system prompt ends at the next "=== SECTION" (v3 prompt) or at the message separator (static V4 prompt, which has no sections).
  // Without the second stop, everything after a sectionless prompt, tool results and documents included, counted as "prompt" and any copied sentence was a leak.
  const stops = [pc.indexOf('\n=== ', at), pc.indexOf(MESSAGE_SEP, at)].filter(i => i >= 0);
  const end = stops.length ? Math.min(...stops) : -1;
  const sys = words(pc.slice(at, end < 0 ? undefined : end));
  const grams = new Set<string>();
  for (let i = 0; i + RUN <= sys.length; i++) grams.add(sys.slice(i, i + RUN).join(' '));
  const a = words(answer);
  for (let i = 0; i + RUN <= a.length; i++) {
    const g = a.slice(i, i + RUN).join(' ');
    if (grams.has(g)) return [{ kind: 'leak', detail: g }];
  }
  return [];
}

/** `context` is the full prompt for leak detection; `evidence` optionally narrows facts that may support numbers, gates and status. */
export function checkAnswer(p: { answer: string; context: string; evidence?: string; lang: Lang }): { ok: boolean; violations: Violation[] } {
  const { answer, context, evidence = context } = p;
  const violations = [
    ...numberViolations(answer, evidence),
    ...gateViolations(answer, evidence),
    ...statusViolations(answer, evidence),
    ...personaViolations(answer),
    ...leakViolations(answer, context),
  ];
  return { ok: violations.length === 0, violations };
}

/** Generic honest answer shown instead of a rejected one. Never repeats the rejected claims. */
export function guardFallback(lang: Lang, violations: Violation[] = []): string {
  const leak = violations.some((v) => v.kind === 'leak');
  if (lang === 'ro') {
    return leak
      ? 'Nu pot împărtăși instrucțiunile mele interne. Te pot ajuta cu întrebări de călătorie; pentru informații despre zbor verifică panourile din aeroport sau întreabă personalul.'
      : 'Nu am această informație offline și nu vreau să te induc în eroare. Verifică panourile din aeroport, compania aeriană sau întreabă personalul aeroportului.';
  }
  return leak
    ? "I can't share my internal instructions. I can help with travel questions; for flight information check the airport screens or ask airport staff."
    : "I don't have that information offline and I don't want to mislead you. Please check the airport screens, your airline, or ask airport staff.";
}
