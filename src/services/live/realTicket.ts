import { julianToDate } from '../../lib/bcbp';
import { flightNumberCandidates } from '../../lib/flightNumber';
import type { BoardingPass } from '../../types';
import type { fetchFlight } from './gatewayClient'; // the module itself is loaded on use: it pulls in the app's stores
import { buildLiveEntry, registerLive } from './liveFlights';

export type RealTicketFailure = 'noNetwork' | 'unauthorized' | 'upstream' | 'flightNotFound' | 'wrongDay' | 'badFlight';
export type RealTicketResult = { ok: true; flightId: string } | { ok: false; error: RealTicketFailure };

const FAILURE: Record<string, RealTicketFailure> = { unreachable: 'noNetwork', unauthorized: 'unauthorized', upstream: 'upstream', not_found: 'flightNotFound' };

/**
 * A real ticket whose flight is not in the bundled schedule: the flight is looked up on the server by number and date only
 * (nothing about the passenger leaves the phone) and registered as a live flight. The ticket's own day is checked against the flight found,
 * so a ticket is never attached to a flight of another day.
 */
export async function resolveRealTicket(pass: BoardingPass, now: Date, lookup?: typeof fetchFlight): Promise<RealTicketResult> {
  const find = lookup ?? (await import('./gatewayClient')).fetchFlight;
  const date = julianToDate(pass.julianDate, now).toISOString().slice(0, 10); // the local departure day, as the server expects it
  let record: Awaited<ReturnType<typeof fetchFlight>>['record'] = null;
  try {
    // The server knows a flight under one spelling (W4 3773 / W43773 / WZZ3773): the next one is tried when it answers "not found"
    for (const candidate of flightNumberCandidates(`${pass.carrier}${pass.flightNumber}`.replace(/\s+/g, '').toUpperCase())) {
      try {
        record = (await find(candidate, date)).record;
        if (record) break;
      } catch (e) {
        if (e instanceof Error && e.message === 'not_found') continue;
        throw e;
      }
    }
  } catch (e) {
    return { ok: false, error: FAILURE[e instanceof Error ? e.message : ''] ?? 'upstream' };
  }
  if (!record) return { ok: false, error: 'flightNotFound' };
  if (record.scheduledDeparture.slice(0, 10) !== date) return { ok: false, error: 'wrongDay' }; // ISO with offset: the first 10 characters are the local day
  const built = buildLiveEntry(record);
  if (!built.ok) return { ok: false, error: 'badFlight' };
  registerLive(built.entry);
  return { ok: true, flightId: built.entry.flight.id };
}
