/**
 * Conservative, deterministic spelling correction for passenger questions (RO + EN).
 *
 * Not a language model: it only repairs a word when ONE unambiguous word of the airport/travel
 * lexicon is within a small edit distance. The corrected text is used for routing and retrieval;
 * the model still sees what the passenger actually typed. Everything is on-device and offline.
 *
 * Safety rules (each guards against a false "correction" turning a valid word into a wrong one):
 *  - tokens with digits, short tokens (<5 letters), and known/common words are never touched;
 *  - inflected forms of lexicon words ("bagajele" from "bagaj") count as known;
 *  - same first letter required; distance 1 for 5-7 letters, 2 for 8+;
 *  - when two candidates tie, nothing is changed.
 */
import commonWords from '../data/common-words.json';
import { KNOWLEDGE_BASE } from './knowledge';
import { ROUTER_WORDS, normalize } from './router';

export type Correction = { from: string; to: string };

const plain = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Frequent function words: always considered correct, so they can never be "fixed" into domain words. */
const COMMON = `
ce cum unde cand cat cate care cine pentru este sunt era fost fi sa se si sau dar nu da mai mult putin foarte
am ai are avem aveti au imi mi ma te ti il o un una unei unui din la de in pe cu fara prin dupa inainte acum azi
maine ieri vreau pot poti putem trebuie ar fi aici acolo acesta aceasta acestea acel acea mea meu mele mei tau
tale lui ei lor noi voi ei eu tu el ea ma rog multumesc buna salut ajutor ajutati spune spuneti zi arata
the a an is are was were be been am do does did have has had can could will would should may might must not no yes
what when where which who whom why how that this these those there here with without for from into onto about
after before during over under again then than too very just also only any some all each every other another
my your his her its our their me you him them we they it i and or but if so as at by of on to up out off
please thanks thank hello hi hey sorry help tell show give take get got need want know think see look
very much many more most less few little long short high low new old good bad big small first last next
now today tomorrow yesterday soon later already still always never again maybe really right wrong
romana romaneste engleza english romanian germana franceza italiana spaniola limba limbi vorbi vorbesti vorbiti
`.split(/\s+/).filter(Boolean);

const ABBREV: Record<string, string> = { pls: 'please', plz: 'please', thx: 'thanks', mersi: 'multumesc' };

export type Lexicon = { freq: Map<string, number>; words: string[] };

let cached: Lexicon | null = null;

/** Build the lexicon from the knowledge base and the router vocabulary (cached). */
export function defaultLexicon(): Lexicon {
  if (cached) return cached;
  const freq = new Map<string, number>();
  const add = (w: string, weight = 1) => {
    if (w.length >= 4 && /^[a-z]+$/.test(w)) freq.set(w, (freq.get(w) ?? 0) + weight);
  };
  for (const e of KNOWLEDGE_BASE) {
    for (const k of e.keywords) normalize(k).split(' ').forEach((w) => add(w, 3));
    normalize(e.title + ' ' + e.body).split(' ').forEach((w) => add(w, 1));
  }
  for (const w of ROUTER_WORDS) normalize(w).split(' ').forEach((x) => add(x, 5));
  cached = { freq, words: [...freq.keys()] };
  return cached;
}

/** Damerau-Levenshtein (optimal string alignment): a transposition counts as one edit. */
export function editDistance(a: string, b: string, limit = 3): number {
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...new Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const c = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + c);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

const COMMON_SET = new Set<string>([...COMMON, ...(commonWords as { words: string[] }).words]);

function isKnown(t: string, lex: Lexicon): boolean {
  if (COMMON_SET.has(t) || lex.freq.has(t)) return true;
  // Inflection / compound of a known word: "bagajele", "aeroportului", "securitatea".
  if (t.length >= 6) {
    for (const w of lex.words) if (w.length >= 5 && t.startsWith(w)) return true;
  }
  return false;
}

const firstDiff = (a: string, b: string) => {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
};

const KEY_NEIGHBORS: Record<string, string> = {
  q: 'wa', w: 'qes', e: 'wrd', r: 'etf', t: 'ryg', y: 'tuh', u: 'yij', i: 'uok', o: 'ipl', p: 'ol',
  a: 'qsz', s: 'awdx', d: 'sefc', f: 'drgv', g: 'fthb', h: 'gyjn', j: 'hukm', k: 'jil', l: 'kop',
  z: 'asx', x: 'zsdc', c: 'xdfv', v: 'cfgb', b: 'vghn', n: 'bhjm', m: 'njk',
};

/**
 * Is `typed` a believable slip for `word`? One edit only: transposition, a missing letter, a doubled
 * letter, or a neighbouring key. Rules out valid-but-different words ("trece" vs "treci", "print" vs "prin").
 * Two-edit corrections (long words only) are accepted as-is.
 */
export function plausibleSlip(typed: string, word: string): boolean {
  if (editDistance(typed, word, 2) > 1) return true;
  if (typed.length === word.length) {
    const i = [...typed].findIndex((c, k) => c !== word[k]);
    if (typed[i] === word[i + 1] && typed[i + 1] === word[i]) return true; // adjacent transposition
    return (KEY_NEIGHBORS[word[i]] ?? '').includes(typed[i]); // neighbouring key
  }
  if (typed.length === word.length - 1) return true; // a letter is missing
  // typed has one extra letter: believable only as a doubled letter
  const k = [...typed].findIndex((c, i) => c !== word[i]);
  const extra = k === -1 ? typed.length - 1 : k;
  return typed[extra] === typed[extra - 1] || typed[extra] === typed[extra + 1];
}

/** The single best lexicon word for a misspelled token, or null when there is none or it is ambiguous. */
export function suggest(token: string, lex: Lexicon = defaultLexicon()): string | null {
  const t = plain(token);
  if (t.length < 5 || /\d/.test(t) || !/^[a-z]+$/.test(t) || isKnown(t, lex)) return null;
  const max = t.length >= 8 ? 2 : 1;
  const cands: { w: string; d: number; f: number }[] = [];
  for (const w of lex.words) {
    if (w[0] !== t[0] || Math.abs(w.length - t.length) > max) continue;
    const d = editDistance(t, w, max);
    // Two-edit matches whose only difference is the ending are inflections ("asistentul" vs "asistenta"), not typos.
    if (d === 2 && firstDiff(t, w) >= Math.min(t.length, w.length) - 3) continue;
    if (d <= max && plausibleSlip(t, w)) cands.push({ w, d, f: lex.freq.get(w) ?? 0 });
  }
  if (!cands.length) return null;
  cands.sort((x, y) => x.d - y.d || y.f - x.f);
  const [best, second] = cands;
  if (second && second.d === best.d && second.f === best.f) return null; // ambiguous
  return best.w;
}

export type Corrected = { text: string; changes: Correction[] };

/** Correct a whole question. Protected: flight numbers, anything with digits, quoted text. */
export function correctQuestion(q: string, lex: Lexicon = defaultLexicon()): Corrected {
  const changes: Correction[] = [];
  const text = q.replace(/"[^"]*"|[\p{L}][\p{L}'’-]*/gu, (tok) => {
    if (tok.startsWith('"')) return tok;
    const key = plain(tok);
    const abbr = ABBREV[key];
    const fix = abbr ?? suggest(tok, lex);
    if (!fix || fix === key) return tok;
    changes.push({ from: tok, to: fix });
    return tok[0] === tok[0].toUpperCase() && tok[0] !== tok[0].toLowerCase() ? fix[0].toUpperCase() + fix.slice(1) : fix;
  });
  return { text, changes };
}
