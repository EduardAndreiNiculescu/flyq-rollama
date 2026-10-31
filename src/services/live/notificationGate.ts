/** A gate in a notification's text, e.g. "Poarta s-a schimbat: 2 → 3" or "Gate changed from 2 to 3": the last gate-like token after the word for gate. Best effort. */
export function gateFromNotificationText(text: string): string | null {
  const m = /(?:poart[aăe]|gate)\b(.*)$/i.exec(text);
  if (!m) return null;
  const tokens = m[1].match(/\b[A-Z]?\d{1,2}[A-Z]?\b/gi);
  return tokens && tokens.length ? tokens[tokens.length - 1].toUpperCase() : null;
}

export type NotificationChange = { gate?: string; oldGate?: string; delayMinutes?: number; source: 'data' | 'text' | 'none' };

/**
 * What a flight notification says changed. The FlyQ server puts flightId, event, gate, newGate, oldGate and delayMinutes in the push body (content.data) and
 * under `flyq`; both are read. When there is no data (an older server), the gate is taken from the text as a last resort.
 */
export function readNotificationChange(data: Record<string, unknown> | null | undefined, text = ''): NotificationChange {
  const flat = { ...(typeof data?.flyq === 'object' && data.flyq ? (data.flyq as Record<string, unknown>) : {}), ...(data ?? {}) };
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim().toUpperCase() : typeof v === 'number' ? String(v) : undefined);
  const gate = str(flat.newGate) ?? str(flat.gate);
  const delay = typeof flat.delayMinutes === 'number' ? flat.delayMinutes : typeof flat.delayMinutes === 'string' && /^\d+$/.test(flat.delayMinutes) ? Number(flat.delayMinutes) : undefined;
  if (gate || delay !== undefined) return { gate, oldGate: str(flat.oldGate), delayMinutes: delay, source: 'data' };
  const fromText = /poart|gate/i.test(text) ? gateFromNotificationText(text) : null;
  return fromText ? { gate: fromText, source: 'text' } : { source: 'none' };
}
