/** A gate in a notification's text, e.g. "Poarta s-a schimbat: 2 → 3" or "Gate changed from 2 to 3": the last gate-like token after the word for gate. Best effort. */
export function gateFromNotificationText(text: string): string | null {
  const m = /(?:poart[aăe]|gate)\b(.*)$/i.exec(text);
  if (!m) return null;
  const tokens = m[1].match(/\b[A-Z]?\d{1,2}[A-Z]?\b/gi);
  return tokens && tokens.length ? tokens[tokens.length - 1].toUpperCase() : null;
}
