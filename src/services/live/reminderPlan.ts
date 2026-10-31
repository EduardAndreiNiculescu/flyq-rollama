/**
 * Local flight reminders (no server, no Apple push): the reminders a ticket needs and when they fire. Pure, so it is tested without the phone.
 * Times follow the server's delay: if the flight is 25 min late, boarding and gate closing move 25 min.
 */
export type Reminder = { id: string; atMs: number; title: string; body: string };

export type PlanInput = {
  flightNumber: string;
  from: string;
  to: string;
  /** Scheduled times (ISO UTC) of the flight the screens hold */
  boardingUtc: string;
  gateCloseUtc: string;
  departureUtc: string;
  gate: string | null;
  delayMin: number;
  language: 'ro' | 'en';
  nowMs: number;
};

const MIN = 60_000;
const MAX_AHEAD_MS = 48 * 3_600_000;
const GATE_NONE = new Set(['', '—', '-', '–']);

export const REMINDER_PREFIX = 'flyq-reminder-';

export function planReminders(p: PlanInput): Reminder[] {
  const delay = Math.max(0, p.delayMin) * MIN;
  const boarding = Date.parse(p.boardingUtc) + delay;
  const gateClose = Date.parse(p.gateCloseUtc) + delay;
  if (Number.isNaN(boarding) || Number.isNaN(gateClose)) return [];
  const ro = p.language === 'ro';
  const gate = p.gate && !GATE_NONE.has(p.gate) ? p.gate : null;
  const where = gate ? (ro ? `poarta ${gate}` : `gate ${gate}`) : ro ? 'poarta se anunță pe panouri' : 'the gate is shown on the screens';
  const f = `${p.flightNumber} ${p.from} → ${p.to}`;
  const list: Reminder[] = [
    { id: 'before-boarding', atMs: boarding - 15 * MIN, title: ro ? 'Îmbarcarea începe în 15 minute' : 'Boarding starts in 15 minutes', body: `${f} · ${where}` },
    { id: 'boarding', atMs: boarding, title: ro ? 'A început îmbarcarea' : 'Boarding has started', body: `${f} · ${where}` },
    { id: 'gate-closing', atMs: gateClose - 10 * MIN, title: ro ? 'Poarta se închide în 10 minute' : 'The gate closes in 10 minutes', body: `${f} · ${where}` },
  ];
  return list.filter(r => r.atMs > p.nowMs + 5_000 && r.atMs < p.nowMs + MAX_AHEAD_MS).map(r => ({ ...r, id: REMINDER_PREFIX + r.id }));
}

/** A fingerprint of a plan: when it is unchanged nothing is rescheduled. */
export const planKey = (rs: Reminder[]) => rs.map(r => `${r.id}@${r.atMs}:${r.body}`).join('|');
