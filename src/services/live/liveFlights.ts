import { localIso } from '../../core/airports';
import type { FlightRecord } from '../../core/types';
import type { Airport, Flight } from '../../types';

// Coordonate APROXIMATE ale aeroporturilor, doar pentru desenul și calculele UI de test (progres, distanță).
// Orice fapt despre zbor (ore, poartă, întârziere, poziție) vine din gateway, nu de aici.
// Un aeroport lipsă = zborul nu poate fi adăugat în modul test.
type Row = { city: string; name: string; lat: number; lon: number; tz: string; schengen: boolean };
export const TEST_AIRPORTS: Record<string, Row> = {
  CRA: { city: 'Craiova', name: 'Aeroportul Internațional Craiova', lat: 44.3181, lon: 23.8886, tz: 'Europe/Bucharest', schengen: true },
  OTP: { city: 'București', name: 'Henri Coandă', lat: 44.5711, lon: 26.085, tz: 'Europe/Bucharest', schengen: true },
  TSR: { city: 'Timișoara', name: 'Traian Vuia', lat: 45.8099, lon: 21.3379, tz: 'Europe/Bucharest', schengen: true },
  CLJ: { city: 'Cluj-Napoca', name: 'Avram Iancu', lat: 46.7852, lon: 23.6862, tz: 'Europe/Bucharest', schengen: true },
  IAS: { city: 'Iași', name: 'Iași', lat: 47.1785, lon: 27.6206, tz: 'Europe/Bucharest', schengen: true },
  SBZ: { city: 'Sibiu', name: 'Sibiu', lat: 45.7856, lon: 24.0913, tz: 'Europe/Bucharest', schengen: true },
  LTN: { city: 'Londra Luton', name: 'London Luton', lat: 51.8747, lon: -0.3683, tz: 'Europe/London', schengen: false },
  LGW: { city: 'Londra Gatwick', name: 'London Gatwick', lat: 51.1537, lon: -0.1821, tz: 'Europe/London', schengen: false },
  STN: { city: 'Londra Stansted', name: 'London Stansted', lat: 51.886, lon: 0.2389, tz: 'Europe/London', schengen: false },
  LHR: { city: 'Londra Heathrow', name: 'London Heathrow', lat: 51.47, lon: -0.4543, tz: 'Europe/London', schengen: false },
  MAN: { city: 'Manchester', name: 'Manchester', lat: 53.3537, lon: -2.275, tz: 'Europe/London', schengen: false },
  DUB: { city: 'Dublin', name: 'Dublin', lat: 53.4213, lon: -6.2701, tz: 'Europe/Dublin', schengen: false },
  BGY: { city: 'Bergamo', name: 'Milano Bergamo', lat: 45.6739, lon: 9.7042, tz: 'Europe/Rome', schengen: true },
  MXP: { city: 'Milano', name: 'Milano Malpensa', lat: 45.6306, lon: 8.7281, tz: 'Europe/Rome', schengen: true },
  FCO: { city: 'Roma', name: 'Roma Fiumicino', lat: 41.8003, lon: 12.2389, tz: 'Europe/Rome', schengen: true },
  CIA: { city: 'Roma', name: 'Roma Ciampino', lat: 41.7994, lon: 12.5949, tz: 'Europe/Rome', schengen: true },
  MUC: { city: 'München', name: 'München', lat: 48.3538, lon: 11.7861, tz: 'Europe/Berlin', schengen: true },
  FRA: { city: 'Frankfurt', name: 'Frankfurt', lat: 50.0379, lon: 8.5622, tz: 'Europe/Berlin', schengen: true },
  BER: { city: 'Berlin', name: 'Berlin Brandenburg', lat: 52.3667, lon: 13.5033, tz: 'Europe/Berlin', schengen: true },
  VIE: { city: 'Viena', name: 'Viena', lat: 48.1103, lon: 16.5697, tz: 'Europe/Vienna', schengen: true },
  CDG: { city: 'Paris', name: 'Paris Charles de Gaulle', lat: 49.0097, lon: 2.5479, tz: 'Europe/Paris', schengen: true },
  ORY: { city: 'Paris', name: 'Paris Orly', lat: 48.7233, lon: 2.3794, tz: 'Europe/Paris', schengen: true },
  AMS: { city: 'Amsterdam', name: 'Amsterdam Schiphol', lat: 52.3105, lon: 4.7683, tz: 'Europe/Amsterdam', schengen: true },
  BRU: { city: 'Bruxelles', name: 'Bruxelles', lat: 50.9014, lon: 4.4844, tz: 'Europe/Brussels', schengen: true },
  MAD: { city: 'Madrid', name: 'Madrid Barajas', lat: 40.4983, lon: -3.5676, tz: 'Europe/Madrid', schengen: true },
  BCN: { city: 'Barcelona', name: 'Barcelona', lat: 41.2974, lon: 2.0833, tz: 'Europe/Madrid', schengen: true },
  LIS: { city: 'Lisabona', name: 'Lisabona', lat: 38.7742, lon: -9.1342, tz: 'Europe/Lisbon', schengen: true },
  ATH: { city: 'Atena', name: 'Atena', lat: 37.9364, lon: 23.9445, tz: 'Europe/Athens', schengen: true },
  IST: { city: 'Istanbul', name: 'Istanbul', lat: 41.2753, lon: 28.7519, tz: 'Europe/Istanbul', schengen: false },
  BUD: { city: 'Budapesta', name: 'Budapesta', lat: 47.4399, lon: 19.2556, tz: 'Europe/Budapest', schengen: true },
  WAW: { city: 'Varșovia', name: 'Varșovia Chopin', lat: 52.1657, lon: 20.9671, tz: 'Europe/Warsaw', schengen: true },
  PRG: { city: 'Praga', name: 'Praga', lat: 50.1008, lon: 14.26, tz: 'Europe/Prague', schengen: true },
  SOF: { city: 'Sofia', name: 'Sofia', lat: 42.6967, lon: 23.4114, tz: 'Europe/Sofia', schengen: true },
  GOT: { city: 'Göteborg', name: 'Göteborg Landvetter', lat: 57.6628, lon: 12.2798, tz: 'Europe/Stockholm', schengen: true },
  ARN: { city: 'Stockholm', name: 'Stockholm Arlanda', lat: 59.6519, lon: 17.9186, tz: 'Europe/Stockholm', schengen: true },
  CPH: { city: 'Copenhaga', name: 'Copenhaga', lat: 55.6181, lon: 12.6561, tz: 'Europe/Copenhagen', schengen: true },
  OSL: { city: 'Oslo', name: 'Oslo Gardermoen', lat: 60.1976, lon: 11.1004, tz: 'Europe/Oslo', schengen: true },
  HEL: { city: 'Helsinki', name: 'Helsinki', lat: 60.3172, lon: 24.9633, tz: 'Europe/Helsinki', schengen: true },
  DUS: { city: 'Düsseldorf', name: 'Düsseldorf', lat: 51.2895, lon: 6.7668, tz: 'Europe/Berlin', schengen: true },
  HAM: { city: 'Hamburg', name: 'Hamburg', lat: 53.6304, lon: 9.9882, tz: 'Europe/Berlin', schengen: true },
  STR: { city: 'Stuttgart', name: 'Stuttgart', lat: 48.6899, lon: 9.222, tz: 'Europe/Berlin', schengen: true },
  NCE: { city: 'Nisa', name: 'Nisa Côte d’Azur', lat: 43.6584, lon: 7.2159, tz: 'Europe/Paris', schengen: true },
  VCE: { city: 'Veneția', name: 'Veneția Marco Polo', lat: 45.5053, lon: 12.3519, tz: 'Europe/Rome', schengen: true },
  NAP: { city: 'Napoli', name: 'Napoli', lat: 40.886, lon: 14.2908, tz: 'Europe/Rome', schengen: true },
  BLQ: { city: 'Bologna', name: 'Bologna', lat: 44.5354, lon: 11.2887, tz: 'Europe/Rome', schengen: true },
  PMI: { city: 'Palma de Mallorca', name: 'Palma', lat: 39.5517, lon: 2.7388, tz: 'Europe/Madrid', schengen: true },
  AGP: { city: 'Málaga', name: 'Málaga', lat: 36.6749, lon: -4.4991, tz: 'Europe/Madrid', schengen: true },
  VLC: { city: 'Valencia', name: 'Valencia', lat: 39.4893, lon: -0.4816, tz: 'Europe/Madrid', schengen: true },
  OPO: { city: 'Porto', name: 'Porto', lat: 41.2481, lon: -8.6814, tz: 'Europe/Lisbon', schengen: true },
  ZRH: { city: 'Zürich', name: 'Zürich', lat: 47.4647, lon: 8.5492, tz: 'Europe/Zurich', schengen: true },
};

/** Offset in minutes (local = UTC + offset) of an IANA zone at an instant, DST-correct. */
export function offsetMinAt(tz: string, ms: number): number {
  const m = /([+-])(\d{2}):(\d{2})$/.exec(localIso(ms, tz));
  if (!m) return 0;
  return (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3]));
}

export type LiveEntry = { flight: Flight; record: FlightRecord; from: Airport; to: Airport };
export type BuildResult = { ok: true; entry: LiveEntry } | { ok: false; error: string };

const airport = (code: string, ms: number): Airport | null => {
  const a = TEST_AIRPORTS[code];
  return a ? { code, city: a.city, name: a.name, lat: a.lat, lon: a.lon, utcOffsetMin: offsetMinAt(a.tz, ms), schengen: a.schengen } : null;
};

/**
 * Turn the gateway's FlightRecord into the UI's Flight. Boarding and gate-close times are NOT provider data:
 * they are derived (40 and 20 min before departure) so the existing screens have something to show in test mode.
 */
export function buildLiveEntry(record: FlightRecord): BuildResult {
  const m = /^([A-Z0-9]{2})(\d{1,4}[A-Z]?)$/.exec(record.flightNumber.replace(/\s+/g, '').toUpperCase());
  if (!m) return { ok: false, error: `format necunoscut pentru numărul de zbor ${record.flightNumber}` };
  const dep = Date.parse(record.scheduledDeparture);
  const arr = Date.parse(record.scheduledArrival);
  if (Number.isNaN(dep) || Number.isNaN(arr) || arr <= dep) return { ok: false, error: 'orarul zborului nu poate fi citit' };
  const from = airport(record.departureAirport, dep);
  const to = airport(record.arrivalAirport, arr);
  if (!from || !to) return { ok: false, error: `aeroport lipsă din tabelul de test: ${!from ? record.departureAirport : record.arrivalAirport}` };
  const date = new Date(dep).toISOString().slice(0, 10);
  const flight: Flight = {
    id: `live-${m[1]}${m[2]}-${date}`,
    carrier: m[1],
    carrierName: m[1],
    flightNumber: m[2],
    from: from.code,
    to: to.code,
    departureUtc: new Date(dep).toISOString(),
    arrivalUtc: new Date(arr).toISOString(),
    boardingUtc: new Date(dep - 40 * 60_000).toISOString(),
    gateCloseUtc: new Date(dep - 20 * 60_000).toISOString(),
    gate: record.gate && record.gateStatus === 'confirmed' ? record.gate : '—',
    gateFloor: 1,
    aircraft: 'n/a',
    cruiseAltitudeM: 11000,
    cruiseSpeedKmh: 830,
  };
  return { ok: true, entry: { flight, record, from, to } };
}

const registry = new Map<string, LiveEntry>();
export const registerLive = (e: LiveEntry) => void registry.set(e.flight.id, e);
export const getLiveEntry = (flightId: string) => registry.get(flightId) ?? null;
export const getLiveAirport = (code: string): Airport | null => {
  for (const e of registry.values()) {
    if (e.from.code === code) return e.from;
    if (e.to.code === code) return e.to;
  }
  return null;
};
export const isLiveFlightId = (id: string) => id.startsWith('live-');
