/**
 * Flight numbers come in several shapes: IATA ("W6 3541", "W63541"), ICAO callsigns ("WZZ3541"), and the ones travel sites print ("GFA006": the ICAO
 * airline code with the number zero-padded to three digits). The FlyQ server looks a flight up in one format, so when a search finds nothing the app
 * tries the other spellings of the same flight, in a fixed order, and stops at the first the server knows. The table is the airlines seen around
 * Craiova and the common ones in Europe and the Gulf; an airline that is not in it is simply tried as typed (and without leading zeros).
 */
const AIRLINES: [iata: string, icao: string][] = [
  ['W6', 'WZZ'], ['W4', 'WMT'], ['W9', 'WUK'], ['RO', 'ROT'], ['FR', 'RYR'], ['RK', 'RUK'], ['U2', 'EZY'], ['EC', 'EJU'], ['DS', 'EZS'],
  ['LH', 'DLH'], ['EW', 'EWG'], ['OS', 'AUA'], ['LX', 'SWR'], ['AF', 'AFR'], ['KL', 'KLM'], ['BA', 'BAW'], ['TK', 'THY'], ['PC', 'PGT'],
  ['GF', 'GFA'], ['EK', 'UAE'], ['QR', 'QTR'], ['EY', 'ETD'], ['A3', 'AEE'], ['IB', 'IBE'], ['VY', 'VLG'], ['TP', 'TAP'], ['LO', 'LOT'],
  ['SK', 'SAS'], ['AY', 'FIN'], ['DY', 'NOZ'], ['AZ', 'ITY'], ['EN', 'DLA'], ['SN', 'BEL'], ['LS', 'EXS'], ['BY', 'TOM'], ['0B', 'BMS'],
  ['JU', 'ASL'], ['OU', 'CTN'], ['OK', 'CSA'], ['MS', 'MSR'], ['TU', 'TAR'], ['SU', 'AFL'], ['V7', 'VOE'], ['D8', 'IBK'],
];
const BY_IATA = new Map(AIRLINES);
const BY_ICAO = new Map(AIRLINES.map(([i, c]) => [c, i] as const));

export type ParsedFlight = { prefix: string; kind: 'iata' | 'icao' | 'unknown'; digits: string; suffix: string };

export const cleanFlightNumber = (raw: string) => raw.replace(/[\s\-_.]/g, '').toUpperCase();

export function parseFlightNumber(raw: string): ParsedFlight | null {
  const s = cleanFlightNumber(raw);
  const m3 = /^([A-Z]{3})(\d{1,4})([A-Z]?)$/.exec(s);
  if (m3 && BY_ICAO.has(m3[1])) return { prefix: m3[1], kind: 'icao', digits: m3[2], suffix: m3[3] };
  const m2 = /^([A-Z0-9]{2})(\d{1,4})([A-Z]?)$/.exec(s);
  if (m2 && BY_IATA.has(m2[1])) return { prefix: m2[1], kind: 'iata', digits: m2[2], suffix: m2[3] };
  const any = /^([A-Z0-9]{2,3}?)(\d{1,4})([A-Z]?)$/.exec(s);
  return any ? { prefix: any[1], kind: 'unknown', digits: any[2], suffix: any[3] } : null;
}

/** The spellings to try, best first, without repeats: as typed, without leading zeros, the other airline code with and without zeros. */
export function flightNumberCandidates(raw: string): string[] {
  const typed = cleanFlightNumber(raw);
  const p = parseFlightNumber(raw);
  if (!p) return typed ? [typed] : [];
  const bare = String(Number(p.digits)) + p.suffix; // "006" -> "6"
  const out: string[] = [typed, `${p.prefix}${bare}`];
  if (p.kind === 'icao') {
    const iata = BY_ICAO.get(p.prefix)!;
    out.push(`${iata}${bare}`, `${iata}${p.digits}${p.suffix}`);
  } else if (p.kind === 'iata') {
    out.push(`${BY_IATA.get(p.prefix)!}${p.digits}${p.suffix}`);
  }
  return [...new Set(out)].slice(0, 4);
}
