import type { Flight } from '../types';

/**
 * What the FlyQ server (and its data providers) says about the flight, merged into the Flight the screens read. Before this the screens showed the
 * schedule only, while the Live Activity card (updated by the server) already showed the delay: now both follow the same facts.
 * `departureUtc`/`arrivalUtc` become the estimated times; the scheduled ones stay in `scheduledDepartureUtc`/`scheduledArrivalUtc`.
 */
export type ServerState = {
  gate: string | null;
  gateStatus: 'unconfirmed' | 'confirmed';
  /** ISO times with an offset, as the server sends them */
  estimatedDeparture: string | null;
  estimatedArrival: string | null;
  departureDelayMin: number | null;
  arrivalDelayMin: number | null;
  status: string | null;
  belt: string | null;
};
export type ServerEtaLite = { arrivalEpoch: number; source: 'server' | 'local' } | null | undefined;

const MIN = 60_000;
const ms = (iso: string | null | undefined) => (iso ? Date.parse(iso) : NaN);

export function applyServerState(base: Flight, s: ServerState | undefined, eta: ServerEtaLite): Flight {
  if (!s && !eta) return base;
  const dep = Date.parse(base.departureUtc);
  const arr = Date.parse(base.arrivalUtc);
  const delay = s?.departureDelayMin ?? 0;
  let newDep = dep;
  const est = ms(s?.estimatedDeparture);
  if (!Number.isNaN(est)) newDep = est;
  else if (delay > 0) newDep = dep + delay * MIN;
  const shift = newDep - dep;

  let newArr = arr + shift;
  const estArr = ms(s?.estimatedArrival);
  if (!Number.isNaN(estArr)) newArr = estArr;
  else if (s?.arrivalDelayMin) newArr = arr + s.arrivalDelayMin * MIN;
  if (eta) newArr = eta.arrivalEpoch * 1000; // the server's ETA (or the position model) is the best arrival there is

  const gate = s && s.gate && s.gateStatus === 'confirmed' ? s.gate : base.gate;
  const iso = (n: number) => new Date(n).toISOString();
  return {
    ...base,
    gate,
    departureUtc: iso(newDep),
    arrivalUtc: iso(newArr),
    boardingUtc: iso(Date.parse(base.boardingUtc) + shift),
    gateCloseUtc: iso(Date.parse(base.gateCloseUtc) + shift),
    scheduledDepartureUtc: base.departureUtc,
    scheduledArrivalUtc: base.arrivalUtc,
    delayMin: Math.max(0, Math.round(shift / MIN)),
    status: s?.status ?? undefined,
    baggageBelt: s?.belt ?? undefined,
  };
}
