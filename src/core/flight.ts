import type { FlightRecord } from './types';

/** Fictional demo flight. Never presented as real operational data. */
export const DEMO_FLIGHTS: FlightRecord[] = [
  {
    flightNumber: 'DEMO123',
    departureAirport: 'CRA',
    arrivalAirport: 'BGY',
    scheduledDeparture: '2026-10-31T12:45:00+02:00',
    scheduledArrival: '2026-10-31T14:10:00+01:00',
    gate: null,
    gateStatus: 'unconfirmed',
    dataSource: 'demo',
    lastUpdated: null,
  },
];

export function getFlight(flightNumber: string | undefined, flights = DEMO_FLIGHTS): FlightRecord | null {
  if (!flightNumber) return null;
  const key = flightNumber.replace(/\s+/g, '').toUpperCase();
  return flights.find((f) => f.flightNumber.toUpperCase() === key) ?? null;
}

export type Duration = { minutes: number; text: string };

function fmt(totalMin: number): Duration {
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return { minutes: totalMin, text: `${h}h ${m}min` };
}

/** Scheduled block time; offsets in the ISO strings make this timezone-correct. */
export function scheduledDuration(f: FlightRecord): Duration | null {
  const d = Date.parse(f.scheduledDeparture);
  const a = Date.parse(f.scheduledArrival);
  if (Number.isNaN(d) || Number.isNaN(a) || a <= d) return null;
  return fmt(Math.round((a - d) / 60000));
}

export type TimeRemaining =
  | { status: 'available'; basis: 'scheduled'; duration: Duration; caveat: string; /** from the provider's estimated arrival, when given */ estimated?: Duration }
  | { status: 'not_departed'; untilDeparture: Duration; untilArrival: Duration }
  | { status: 'arrived_per_schedule' }
  | { status: 'unavailable'; reason: string };

/**
 * Remaining time according to the SCHEDULE only. Real delays are unknown offline,
 * so the caveat is always attached and callers must pass it on to the user.
 */
export function timeRemaining(f: FlightRecord, now: Date): TimeRemaining {
  const d = Date.parse(f.scheduledDeparture);
  const a = Date.parse(f.scheduledArrival);
  if (Number.isNaN(d) || Number.isNaN(a) || a <= d) return { status: 'unavailable', reason: 'invalid schedule' };
  const n = now.getTime();
  if (n < d) return { status: 'not_departed', untilDeparture: fmt(Math.round((d - n) / 60000)), untilArrival: fmt(Math.round((a - n) / 60000)) };
  if (n >= a) return { status: 'arrived_per_schedule' };
  const est = f.estimatedArrival ? Date.parse(f.estimatedArrival) : NaN;
  return {
    status: 'available',
    basis: 'scheduled',
    duration: fmt(Math.round((a - n) / 60000)),
    ...(Number.isFinite(est) && est > n ? { estimated: fmt(Math.round((est - n) / 60000)) } : {}),
    caveat:
      f.dataSource === 'demo'
        ? 'Demo (fictional) data; computed from the schedule, not real-time tracking.'
        : 'Computed from the published schedule; actual arrival may differ.',
  };
}

export type DelayVerdict =
  | { verdict: 'early' | 'on_time' | 'delayed'; minutes: number; basis: 'arrival' | 'departure' }
  | { verdict: 'unknown' };

/** 15 min is the usual "delayed" threshold; up to 5 min early still counts as on time. Pure arithmetic, never a model guess. */
export const DELAY_THRESHOLD_MIN = 15;
export const EARLY_THRESHOLD_MIN = 5;

/** Verdict from the provider's ESTIMATE vs the schedule (arrival preferred, else departure). Unknown without an estimate. */
export function delayVerdict(f: FlightRecord): DelayVerdict {
  const pairs: Array<['arrival' | 'departure', string | null | undefined, string]> = [
    ['arrival', f.estimatedArrival, f.scheduledArrival],
    ['departure', f.estimatedDeparture, f.scheduledDeparture],
  ];
  for (const [basis, est, sched] of pairs) {
    const e = est ? Date.parse(est) : NaN;
    const s = Date.parse(sched);
    if (!Number.isFinite(e) || !Number.isFinite(s)) continue;
    const minutes = Math.round((e - s) / 60000);
    const verdict = minutes >= DELAY_THRESHOLD_MIN ? 'delayed' : minutes <= -EARLY_THRESHOLD_MIN ? 'early' : 'on_time';
    return { verdict, minutes, basis };
  }
  return { verdict: 'unknown' };
}

export function flightFacts(f: FlightRecord, now: Date): string {
  const dur = scheduledDuration(f);
  const rem = timeRemaining(f, now);
  const lines = [
    `flight: ${f.flightNumber} ${f.departureAirport}->${f.arrivalAirport}`,
    `scheduled departure: ${f.scheduledDeparture}`,
    `scheduled arrival: ${f.scheduledArrival}`,
    ...(f.estimatedDeparture ? [`estimated departure: ${f.estimatedDeparture} (third-party estimate, may change)`] : []),
    ...(f.estimatedArrival ? [`estimated arrival: ${f.estimatedArrival} (third-party estimate, may change)`] : []),
    ...(() => {
      const v = delayVerdict(f);
      if (v.verdict === 'unknown') return [];
      const m = Math.abs(v.minutes);
      const what = v.verdict === 'delayed' ? `DELAYED by ${m} min` : v.verdict === 'early' ? `EARLIER than scheduled by ${m} min` : `ON TIME (${v.minutes >= 0 ? '+' : '-'}${m} min)`;
      return [`delay verdict (computed from estimated vs scheduled ${v.basis}): ${what} (third-party estimate)`];
    })(),
    ...(f.providerStatus ? [`provider status: ${f.providerStatus} (third-party, not an official statement)`] : []),
    ...(typeof f.departureDelayMin === 'number' ? [`departure delay reported: ${f.departureDelayMin} min (third-party)`] : []),
    ...(typeof f.arrivalDelayMin === 'number' ? [`arrival delay reported: ${f.arrivalDelayMin} min (third-party)`] : []),
    `gate: ${f.gate ?? 'UNKNOWN'} (${f.gateStatus})`,
    `data source: ${f.dataSource}${f.dataSource === 'demo' ? ' (FICTIONAL demo data)' : ''}`,
    `last updated: ${f.lastUpdated ?? 'never'}`,
    `scheduled duration: ${dur ? dur.text : 'unknown'}`,
    `status: NOT AVAILABLE offline (no live tracking)`,
  ];
  if (rem.status === 'available') lines.push(`time to scheduled arrival: ${rem.duration.text} (${rem.caveat})`);
  else if (rem.status === 'not_departed')
    lines.push(`time until scheduled departure: ${rem.untilDeparture.text}`, `time until scheduled arrival: ${rem.untilArrival.text}`);
  else if (rem.status === 'arrived_per_schedule') lines.push('scheduled arrival time has passed');
  return lines.join('\n');
}
