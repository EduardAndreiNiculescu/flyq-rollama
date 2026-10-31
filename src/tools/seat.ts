import { isRomanian, plain } from '../llm/rollama';

/** "Ce loc am?" is answered from the boarding pass the passenger already added; no tool, no model: the seat is data the app holds. */
const SEAT = /\b(?:(?:ce|care) (?:loc|scaun)|locul meu|loc(?:ul)? am|scaunul meu|my seat|which seat|what seat|seat number)\b/;

export function seatAnswer(question: string, seat: string | undefined): string | null {
  if (!seat || !SEAT.test(plain(question))) return null;
  return isRomanian(question) ? `Locul tău este ${seat}.` : `Your seat is ${seat}.`;
}
