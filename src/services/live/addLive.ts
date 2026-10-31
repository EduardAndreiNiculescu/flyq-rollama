import { DEMO_BCBP, parseBcbp } from '../../lib/bcbp';
import { useLive } from '../../store/live';
import { useTickets } from '../../store/tickets';
import type { BoardingPass } from '../../types';
import { clock, flightData } from '../index';
import { fetchFlight } from './gatewayClient';
import { buildLiveEntry, registerLive } from './liveFlights';

const ERRORS: Record<string, string> = {
  unreachable: 'Gateway-ul nu răspunde. Pornește-l pe laptop și verifică adresa.',
  unauthorized: 'Token greșit.',
  not_found: 'Furnizorul nu cunoaște zborul (sau nu e în aer/programat azi).',
  upstream: 'Gateway-ul a dat o eroare (poate s-a terminat bugetul de apeluri sau cererea a fost respinsă).',
};

const dayOfYear = (d: Date) => Math.floor((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - Date.UTC(d.getUTCFullYear(), 0, 0)) / 86_400_000);

export type AddResult = { ok: boolean; message: string; flightId?: string };

/** A real flight from the gateway becomes the active ticket (used by the Test mode screen and by the remote command). */
export async function addLiveFlight(raw: string): Promise<AddResult> {
  const number = raw.replace(/\s+/g, '').toUpperCase();
  if (!/^[A-Z0-9]{2,3}\d{1,4}[A-Z]?$/.test(number)) return { ok: false, message: 'Format de zbor invalid (ex. RO311, W63541).' };
  try {
    const { record } = await fetchFlight(number);
    if (!record) return { ok: false, message: 'Furnizorul a găsit zborul, dar fără orar complet; nu inventez ore.' };
    const built = buildLiveEntry(record);
    if (!built.ok) return { ok: false, message: `Nu pot adăuga zborul: ${built.error}.` };
    registerLive(built.entry);
    const f = built.entry.flight;
    const pass: BoardingPass = {
      raw: `LIVE:${record.flightNumber}:${f.departureUtc.slice(0, 10)}`, formatCode: 'M', legs: 1, passengerName: 'PASAGER TEST', electronicTicket: true, pnr: 'LIVE00',
      from: f.from, to: f.to, carrier: f.carrier, flightNumber: f.flightNumber, julianDate: dayOfYear(new Date(f.departureUtc)), compartment: 'Y', seat: '1A', sequence: '0001', passengerStatus: '1',
    };
    useTickets.getState().addTicket(pass, f.id, true);
    useLive.getState().pushRecent(number);
    useLive.getState().setTrackerSource('live');
    return { ok: true, message: `Adăugat ${number}: ${f.from} → ${f.to}.`, flightId: f.id };
  } catch (e) {
    return { ok: false, message: ERRORS[e instanceof Error ? e.message : ''] ?? 'Eroare necunoscută.' };
  }
}

/** The simulated demo ticket (same as the "Zbor demo" button). */
export function addDemoFlight(): AddResult {
  const parsed = parseBcbp(DEMO_BCBP);
  if (!parsed.ok) return { ok: false, message: 'Codul demo nu se poate citi.' };
  const flight = flightData.findFlight(parsed.pass, clock.now());
  if (!flight) return { ok: false, message: 'Zborul demo nu există.' };
  useTickets.getState().addTicket(parsed.pass, flight.id, true);
  useLive.getState().setTrackerSource('mock');
  return { ok: true, message: 'Zbor demo activ.', flightId: flight.id };
}
