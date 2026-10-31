import { Platform } from 'react-native';
import type { FlightRecord } from '../../core/types';
import { liveArrival, type ArrivalEstimate } from './arrival';
import FlightActivity, { type FlightActivityProps } from './flightActivity';
import { patchLiveActivityToken } from './push';

/** "2026-10-31T08:40:00+02:00" -> "08:40": the clock time of the offset the string carries (airport time). */
const clock = (iso: string | null | undefined) => (iso && /T(\d{2}:\d{2})/.exec(iso)?.[1]) || null;

/** Tapping the card opens this screen of the app (see linking in app/App.tsx), not just the app. */
export const ACTIVITY_URL = 'flyq://live';

export type Boarding = { time: string; epoch: number };

/** The card's first state, from the flight the app holds; the server sends the next ones (same keys). */
export function activityProps(record: FlightRecord, boarding?: Boarding | null, arrival?: ArrivalEstimate | null): FlightActivityProps {
  const delay = record.departureDelayMin ?? 0;
  const departure = Date.parse(record.scheduledDeparture);
  return {
    flightNumber: record.flightNumber,
    from: record.departureAirport,
    to: record.arrivalAirport,
    // In the air = the server has a live position that gives a landing estimate; nothing else is allowed to say "departed" here.
    status: arrival ? 'departed' : record.providerStatus === 'landed' ? 'landed' : delay > 0 ? 'delayed' : 'scheduled',
    gate: record.gate,
    boardingTime: boarding?.time ?? null,
    boardingEpoch: boarding?.epoch ?? null,
    arrivalTime: arrival?.arrivalTime ?? clock(record.scheduledArrival),
    arrivalEpoch: arrival?.arrivalEpoch ?? null,
    progress: arrival?.progress ?? null,
    departureEpoch: Number.isFinite(departure) ? Math.floor(departure / 1000) : null,
    departureTime: clock(record.scheduledDeparture) ?? '--:--',
    estimatedDeparture: clock(record.estimatedDeparture),
    delayMinutes: Math.max(0, delay),
    updatedAt: Math.floor(Date.now() / 1000),
  };
}

export type ActivityResult = { ok: boolean; message: string };

const REFRESH_MS = 60_000;
let timer: ReturnType<typeof setInterval> | null = null;

const stopRefresh = () => {
  if (timer) clearInterval(timer);
  timer = null;
};

/** Asks the server for the live position and updates the card with the landing estimate. Only runs while the app is open (JS timers stop in the background). */
async function refresh(record: FlightRecord, boarding: Boarding | null | undefined): Promise<ArrivalEstimate | null> {
  const arrival = await liveArrival(record);
  if (arrival) for (const a of FlightActivity.getInstances()) await a.update(activityProps(record, boarding, arrival));
  return arrival;
}

/**
 * Starts the Live Activity and hands its push token to the FlyQ server (needs the push subscription first). Every new activity has its own token,
 * so the listener sends each one. While the app is open the card is also refreshed once a minute with the landing estimate from the live position.
 * iOS only; throws nothing: the result says what happened.
 */
export async function startFlightActivity(record: FlightRecord, boarding?: Boarding | null, onToken?: (token: string) => void): Promise<ActivityResult> {
  if (Platform.OS !== 'ios') return { ok: false, message: 'Live Activities există doar pe iPhone.' };
  try {
    stopRefresh();
    for (const old of FlightActivity.getInstances()) await old.end('immediate'); // one card at a time
    const first = await liveArrival(record); // already in the air when the card starts? then it starts with the estimate
    const activity = FlightActivity.start(activityProps(record, boarding, first), ACTIVITY_URL);
    activity.addPushTokenListener(e => {
      onToken?.(e.pushToken);
      void patchLiveActivityToken(e.pushToken);
    });
    timer = setInterval(() => void refresh(record, boarding), REFRESH_MS);
    const token = await activity.getPushToken();
    if (token) onToken?.(token);
    const sent = token ? await patchLiveActivityToken(token) : 'Token-ul activității nu e gata încă; îl trimit când apare.';
    return { ok: true, message: `Card pornit${first ? ` (în zbor, aterizare estimată ${first.arrivalTime})` : ''}. ${sent}` };
  } catch (e) {
    return { ok: false, message: `Live Activity nu a pornit: ${String(e)}` };
  }
}

/** One-off refresh for the live screen / a button: the estimate, or null (nothing live: not airborne, offline, stale). */
export async function refreshFlightActivity(record: FlightRecord, boarding?: Boarding | null): Promise<ArrivalEstimate | null> {
  return refresh(record, boarding);
}

export async function endFlightActivity(): Promise<ActivityResult> {
  try {
    stopRefresh();
    for (const a of FlightActivity.getInstances()) await a.end('immediate');
    return { ok: true, message: `Card închis. ${await patchLiveActivityToken(null)}` };
  } catch (e) {
    return { ok: false, message: `Nu s-a putut închide: ${String(e)}` };
  }
}
