import { Platform } from 'react-native';
import type { FlightRecord } from '../../core/types';
import FlightActivity, { type FlightActivityProps } from './flightActivity';
import { patchLiveActivityToken } from './push';

/** "2026-10-31T08:40:00+02:00" -> "08:40": the clock time of the offset the string carries (airport time). */
const clock = (iso: string | null | undefined) => (iso && /T(\d{2}:\d{2})/.exec(iso)?.[1]) || null;

/** The card's first state, from the flight the app holds; the server sends the next ones (same keys). */
export type Boarding = { time: string; epoch: number };

export function activityProps(record: FlightRecord, boarding?: Boarding | null): FlightActivityProps {
  const delay = record.departureDelayMin ?? 0;
  const departure = Date.parse(record.scheduledDeparture);
  return {
    flightNumber: record.flightNumber,
    from: record.departureAirport,
    to: record.arrivalAirport,
    status: record.providerStatus === 'landed' ? 'landed' : delay > 0 ? 'delayed' : 'scheduled',
    gate: record.gate,
    boardingTime: boarding?.time ?? null,
    boardingEpoch: boarding?.epoch ?? null,
    arrivalTime: clock(record.scheduledArrival),
    departureEpoch: Number.isFinite(departure) ? Math.floor(departure / 1000) : null,
    departureTime: clock(record.scheduledDeparture) ?? '--:--',
    estimatedDeparture: clock(record.estimatedDeparture),
    delayMinutes: Math.max(0, delay),
    updatedAt: Math.floor(Date.now() / 1000),
  };
}

export type ActivityResult = { ok: boolean; message: string };

/**
 * Starts the Live Activity and hands its push token to the FlyQ server (needs the push subscription first). Every new activity has its own token,
 * so the listener sends each one. iOS only; throws nothing: the result says what happened.
 */
export async function startFlightActivity(record: FlightRecord, boarding?: Boarding | null, onToken?: (token: string) => void): Promise<ActivityResult> {
  if (Platform.OS !== 'ios') return { ok: false, message: 'Live Activities există doar pe iPhone.' };
  try {
    for (const old of FlightActivity.getInstances()) await old.end('immediate'); // one card at a time
    const activity = FlightActivity.start(activityProps(record, boarding));
    activity.addPushTokenListener(e => {
      onToken?.(e.pushToken);
      void patchLiveActivityToken(e.pushToken);
    });
    const token = await activity.getPushToken();
    if (token) onToken?.(token);
    const sent = token ? await patchLiveActivityToken(token) : 'Token-ul activității nu e gata încă; îl trimit când apare.';
    return { ok: true, message: `Card pornit. ${sent}` };
  } catch (e) {
    return { ok: false, message: `Live Activity nu a pornit: ${String(e)}` };
  }
}

export async function endFlightActivity(): Promise<ActivityResult> {
  try {
    for (const a of FlightActivity.getInstances()) await a.end('immediate');
    return { ok: true, message: `Card închis. ${await patchLiveActivityToken(null)}` };
  } catch (e) {
    return { ok: false, message: `Nu s-a putut închide: ${String(e)}` };
  }
}
