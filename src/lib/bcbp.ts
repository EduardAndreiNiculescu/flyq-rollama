import type { BoardingPass } from '../types';

// Parser pentru câmpurile obligatorii din BCBP (IATA Resolution 792): primele 60 de caractere,
// la poziții fixe. Pozițiile de mai jos sunt 1-indexate, ca în standard.
export const BCBP_FIELDS = [
  { key: 'formatCode', start: 1, length: 1 },
  { key: 'legs', start: 2, length: 1 },
  { key: 'passengerName', start: 3, length: 20 },
  { key: 'electronicTicket', start: 23, length: 1 },
  { key: 'pnr', start: 24, length: 7 },
  { key: 'from', start: 31, length: 3 },
  { key: 'to', start: 34, length: 3 },
  { key: 'carrier', start: 37, length: 3 },
  { key: 'flightNumber', start: 40, length: 5 },
  { key: 'julianDate', start: 45, length: 3 },
  { key: 'compartment', start: 48, length: 1 },
  { key: 'seat', start: 49, length: 4 },
  { key: 'sequence', start: 53, length: 5 },
  { key: 'passengerStatus', start: 58, length: 1 },
  { key: 'conditionalSize', start: 59, length: 2 },
] as const;

export const BCBP_MANDATORY_LENGTH = 60;

export type BcbpError =
  | 'tooShort'
  | 'badFormat'
  | 'badLegs'
  | 'badAirport'
  | 'badCarrier'
  | 'badFlightNumber'
  | 'badDate'
  | 'badSeat';

export type BcbpResult = { ok: true; pass: BoardingPass } | { ok: false; error: BcbpError };

function field(raw: string, key: (typeof BCBP_FIELDS)[number]['key']): string {
  const def = BCBP_FIELDS.find(f => f.key === key)!;
  return raw.substr(def.start - 1, def.length);
}

/** „014C” → „14C”, „001A” → „1A”. */
export function normalizeSeat(seat: string): string {
  const match = /^0*(\d+)([A-Z])$/.exec(seat.trim());
  return match ? `${match[1]}${match[2]}` : seat.trim();
}

/** „3541 ” → „3541”, „0123 ” → „123”. Litera opțională de la final rămâne. */
export function normalizeFlightNumber(value: string): string {
  const trimmed = value.trim();
  const match = /^0*(\d+)([A-Z]?)$/.exec(trimmed);
  return match ? `${match[1]}${match[2]}` : trimmed;
}

export function parseBcbp(input: string): BcbpResult {
  // Copierea din e-mail aduce des CR/LF sau tab-uri la final; spațiile interne contează.
  const raw = input.replace(/[\r\n\t]+$/g, '').replace(/^[\r\n\t]+/g, '');
  if (raw.length < BCBP_MANDATORY_LENGTH) return { ok: false, error: 'tooShort' };

  if (field(raw, 'formatCode') !== 'M') return { ok: false, error: 'badFormat' };
  const legs = Number(field(raw, 'legs'));
  if (!Number.isInteger(legs) || legs < 1 || legs > 9) return { ok: false, error: 'badLegs' };

  const from = field(raw, 'from');
  const to = field(raw, 'to');
  if (!/^[A-Z]{3}$/.test(from) || !/^[A-Z]{3}$/.test(to)) return { ok: false, error: 'badAirport' };

  const carrier = field(raw, 'carrier').trim();
  if (!/^[A-Z0-9]{2,3}$/.test(carrier)) return { ok: false, error: 'badCarrier' };

  const flightNumber = normalizeFlightNumber(field(raw, 'flightNumber'));
  if (!/^\d{1,4}[A-Z]?$/.test(flightNumber)) return { ok: false, error: 'badFlightNumber' };

  const julianRaw = field(raw, 'julianDate');
  const julianDate = Number(julianRaw);
  if (!/^\d{3}$/.test(julianRaw) || julianDate < 1 || julianDate > 366) return { ok: false, error: 'badDate' };

  const seatRaw = field(raw, 'seat');
  const seat = normalizeSeat(seatRaw);
  if (!/^\d{1,3}[A-Z]$/.test(seat) && !/^(INF|STBY)/.test(seatRaw.trim())) return { ok: false, error: 'badSeat' };

  return {
    ok: true,
    pass: {
      raw,
      formatCode: 'M',
      legs,
      passengerName: field(raw, 'passengerName').trim(),
      electronicTicket: field(raw, 'electronicTicket') === 'E',
      pnr: field(raw, 'pnr').trim(),
      from,
      to,
      carrier,
      flightNumber,
      julianDate,
      compartment: field(raw, 'compartment'),
      seat,
      sequence: field(raw, 'sequence').trim(),
      passengerStatus: field(raw, 'passengerStatus'),
    },
  };
}

/**
 * BCBP are doar ziua din an, fără an. Alegem anul care pune data cel mai aproape de `now`,
 * preferând viitorul: un bilet e adăugat de obicei înainte de zbor.
 */
export function julianToDate(julianDate: number, now: Date): Date {
  const candidates = [now.getUTCFullYear() - 1, now.getUTCFullYear(), now.getUTCFullYear() + 1].map(
    year => new Date(Date.UTC(year, 0, julianDate)),
  );
  const weekMs = 7 * 24 * 3600 * 1000;
  const scored = candidates.map(date => {
    const diff = date.getTime() - now.getTime();
    // Datele din trecut (mai vechi de o săptămână) sunt penalizate
    return { date, score: diff >= -weekMs ? Math.abs(diff) : Math.abs(diff) * 4 };
  });
  scored.sort((a, b) => a.score - b.score);
  return scored[0]!.date;
}

/** Maschează PNR-ul pentru afișare: „K7XQ2M” → „K7•••2M”. */
export function maskPnr(pnr: string): string {
  if (pnr.length <= 4) return '•'.repeat(pnr.length);
  return `${pnr.slice(0, 2)}${'•'.repeat(pnr.length - 4)}${pnr.slice(-2)}`;
}

/** Codul BCBP al biletului demo (date fictive). */
export const DEMO_BCBP = 'M1POPESCU/ANDREI      EK7XQ2M CRALTNW6 3541 304Y014C0042 100';
