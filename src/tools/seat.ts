import { isRomanian, plain } from '../llm/rollama';

/** "Ce loc am?" is answered from the boarding pass the passenger already added; no tool, no model: the seat is data the app holds. */
const SEAT = /\b(?:(?:ce|care) (?:loc|scaun)|locul meu|loc(?:ul)? am|scaunul meu|my seat|which seat|what seat|seat number)\b/;

export function seatAnswer(question: string, seat: string | undefined): string | null {
  if (!seat || !SEAT.test(plain(question))) return null;
  return isRomanian(question) ? `Locul tău este ${seat}.` : `Your seat is ${seat}.`;
}

/** "When is boarding?": needs a time word and a boarding word, so "how long does boarding take" is not answered with a clock time. */
const BOARDING = /\b(?:imbarc\w*|boarding)\b/;
const TIME_ASK = /\b(?:la ce ora|ce ora|cand|what time|when)\b/;

export function boardingAnswer(question: string, boarding: string | undefined): string | null {
  const q = plain(question);
  if (!boarding || !BOARDING.test(q) || !TIME_ASK.test(q)) return null;
  return isRomanian(question) ? 'Îmbarcarea începe la ' + boarding + ' (ora locală).' : 'Boarding starts at ' + boarding + ' (local time).';
}

/** The knowledge base has no duration for the security check, so the answer says so instead of returning an unrelated article. */
const SECURITY = /\b(?:securit\w*|controlul?)\b/;
const DURATION = /\b(?:cat dureaza|cat timp|cat se asteapta|how long)\b/;

export function securityDurationAnswer(question: string): string | null {
  const q = plain(question);
  if (!SECURITY.test(q) || !DURATION.test(q)) return null;
  return isRomanian(question)
    ? 'Nu am o durată exactă pentru controlul de securitate: depinde de aglomerație. Planifică timp în plus înainte de închiderea porții și scoate din bagaj electronicele și lichidele ca să mergi mai repede.'
    : 'I have no exact duration for the security check: it depends on how busy it is. Allow extra time before the gate closes, and take electronics and liquids out of your bag to go faster.';
}
