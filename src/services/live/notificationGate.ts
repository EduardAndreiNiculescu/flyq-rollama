/** A gate in a notification's text, e.g. "Poarta s-a schimbat: 2 → 3" or "Gate changed from 2 to 3": the last gate-like token after the word for gate. Best effort. */
export function gateFromNotificationText(text: string): string | null {
  const m = /(?:poart[aăe]|gate)\b(.*)$/i.exec(text);
  if (!m) return null;
  const tokens = m[1].match(/\b[A-Z]?\d{1,2}[A-Z]?\b/gi);
  return tokens && tokens.length ? tokens[tokens.length - 1].toUpperCase() : null;
}

export type NotificationChange = { gate?: string; oldGate?: string; delayMinutes?: number; status?: string; belt?: string; source: 'data' | 'text' | 'none' };

/** The server's event names -> the status the screens show. gate_assigned / gate_changed / delay_changed are not statuses. */
export const EVENT_STATUS: Record<string, string> = {
  checkin_open: 'checkin',
  boarding_started: 'boarding',
  gate_closing_soon: 'gate_closing',
  cancelled: 'cancelled',
  diverted: 'diverted',
  landed: 'landed',
};

/**
 * What a flight notification says changed. The FlyQ server puts flightId, event, gate, newGate, oldGate and delayMinutes in the push body (content.data) and
 * under `flyq`; both are read. When there is no data (an older server), the gate is taken from the text as a last resort.
 */
export function readNotificationChange(data: Record<string, unknown> | null | undefined, text = ''): NotificationChange {
  const flat = { ...(typeof data?.flyq === 'object' && data.flyq ? (data.flyq as Record<string, unknown>) : {}), ...(data ?? {}) };
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim().toUpperCase() : typeof v === 'number' ? String(v) : undefined);
  const gate = str(flat.newGate) ?? str(flat.gate);
  const delay = typeof flat.delayMinutes === 'number' ? flat.delayMinutes : typeof flat.delayMinutes === 'string' && /^\d+$/.test(flat.delayMinutes) ? Number(flat.delayMinutes) : undefined;
  const event = typeof flat.event === 'string' ? flat.event : undefined;
  const status = event ? EVENT_STATUS[event] : undefined;
  const belt = str(flat.baggageBelt) ?? str(flat.belt);
  if (gate || delay !== undefined || status || belt) return { gate, oldGate: str(flat.oldGate), delayMinutes: delay, status, belt, source: 'data' };
  const fromText = /poart|gate/i.test(text) ? gateFromNotificationText(text) : null;
  return fromText ? { gate: fromText, source: 'text' } : { source: 'none' };
}
