import * as Notifications from 'expo-notifications';
import { AppState } from 'react-native';
import type { FlightRecord } from '../../core/types';
import { useFlightMode } from '../../store/flightMode';
import { useFlightStatus, type FlightOverlay } from '../../store/flightStatus';
import { useLive } from '../../store/live';
import { useTickets } from '../../store/tickets';
import { flightData } from '../index';
import { fetchFlight } from './gatewayClient';
import { refreshFlightActivity } from './liveActivity';
import { buildLiveEntry, getLiveEntry, isLiveFlightId, registerLive } from './liveFlights';
import { syncReminders } from './localReminders';
import { readNotificationChange } from './notificationGate';
import { FLYQ_DEMO_FLIGHT_ID } from './push';

/**
 * Keeps the screens in step with the FlyQ server: the server checks the flight with its data providers and pushes changes (gate, delay), and the
 * app used to show only the schedule it was built with. Every 15 s while the app is open, when it returns to the foreground and when a
 * notification arrives, the active ticket's flight is read from the server and merged into what the screens show (`flightData.getFlight`).
 */
const POLL_MS = 15_000;

/** The flight number to ask the server about, and the UI flight id the answer belongs to. A demo ticket follows the server's demo flight. */
export function syncTarget(): { flightId: string; number: string } | null {
  const { tickets, activeTicketId } = useTickets.getState();
  const ticket = tickets.find(t => t.id === activeTicketId);
  if (!ticket) return null;
  if (isLiveFlightId(ticket.flightId)) {
    const number = getLiveEntry(ticket.flightId)?.record.flightNumber;
    return number ? { flightId: ticket.flightId, number } : null;
  }
  const demo = /-([A-Z0-9]{3,8})$/.exec(FLYQ_DEMO_FLIGHT_ID)?.[1];
  return demo ? { flightId: ticket.flightId, number: demo } : null;
}

const overlayFrom = (r: FlightRecord): FlightOverlay => ({
  gate: r.gate,
  gateStatus: r.gateStatus,
  estimatedDeparture: r.estimatedDeparture ?? null,
  estimatedArrival: r.estimatedArrival ?? null,
  departureDelayMin: r.departureDelayMin ?? null,
  arrivalDelayMin: r.arrivalDelayMin ?? null,
  providerStatus: r.providerStatus ?? null,
  status: r.providerStatus === 'landed' ? 'landed' : r.providerStatus === 'en-route' ? 'in_air' : null,
  belt: null,
  receivedAt: Date.now(),
});

/** Apply a server record to the screens. Exported for tests and for a notification that carries the new state. */
export function applyRecord(flightId: string, record: FlightRecord): void {
  const store = useFlightStatus.getState();
  const previousGate = store.overlays[flightId]?.gate ?? (flightData.getFlight(flightId)?.gate ?? null);
  if (isLiveFlightId(flightId)) {
    const built = buildLiveEntry(record); // a real flight: refresh the registry entry the screens read
    if (built.ok) registerLive(built.entry);
  }
  const prev = store.overlays[flightId];
  const fresh = overlayFrom(record);
  // A push can know more than the record for a moment (an event status, the belt): keep it until the record says something else.
  store.apply(flightId, { ...fresh, status: fresh.status ?? prev?.status ?? null, belt: prev?.belt ?? null }, previousGate === '—' ? null : previousGate);
}

let running = false;
let lastEtaAt = 0;
const ETA_EVERY_MS = 60_000; // the server caches ~60 s and the provider quota is monthly: no need to ask more often

/** The ETA is worth asking from 15 min before departure until the flight has landed. */
function etaWindowOpen(record: FlightRecord, now = Date.now()): boolean {
  const dep = Date.parse(record.scheduledDeparture);
  const arr = Date.parse(record.scheduledArrival);
  if (Number.isNaN(dep)) return false;
  if (record.providerStatus === 'landed') return false;
  return now >= dep - 15 * 60_000 && (Number.isNaN(arr) || now <= arr + 6 * 3_600_000);
}

/** One read of the server. Never throws; the outcome is in the store (`lastError`). */
export async function syncNow(): Promise<boolean> {
  const target = syncTarget();
  const { flyqKey, backend } = useLive.getState();
  if (!target || backend !== 'flyq' || !flyqKey) return false;
  if (running) return false;
  running = true;
  try {
    const { record } = await fetchFlight(target.number);
    if (!record) {
      useFlightStatus.getState().setSyncResult('no_record');
      return false;
    }
    applyRecord(target.flightId, record);
    void syncReminders(); // the delay or gate may have moved the reminders
    // The provider says the aircraft is en route: switch the flight screen to the in-air view by itself (it used to need the manual "In zbor" switch).
    if (isLiveFlightId(target.flightId) && record.providerStatus === 'en-route' && useFlightMode.getState().phase === 'ground') {
      const f = flightData.getFlight(target.flightId);
      if (f) useFlightMode.getState().takeOff(f);
    }
    if (Date.now() - lastEtaAt >= ETA_EVERY_MS && etaWindowOpen(record)) {
      lastEtaAt = Date.now();
      await refreshFlightActivity(record, null, target.flightId); // server ETA into the store (and the card, if one is running)
    }
    return true;
  } catch (e) {
    useFlightStatus.getState().setSyncResult(e instanceof Error ? e.message : 'error');
    return false;
  } finally {
    running = false;
  }
}

function onNotification(n: Notifications.Notification) {
  const content = n.request.content;
  const change = readNotificationChange(content.data as Record<string, unknown> | undefined, `${content.title ?? ''} ${content.body ?? ''}`);
  const target = syncTarget();
  if (target && change.source !== 'none' && (change.gate || change.delayMinutes !== undefined || change.status || change.belt)) {
    // The push already says what changed: show it at once, then read the server to confirm.
    const store = useFlightStatus.getState();
    const old = store.overlays[target.flightId];
    const base = flightData.getFlight(target.flightId);
    const delay = change.delayMinutes ?? old?.departureDelayMin ?? null;
    store.apply(
      target.flightId,
      {
        gate: change.gate ?? old?.gate ?? null,
        gateStatus: change.gate || old?.gateStatus === 'confirmed' ? 'confirmed' : 'unconfirmed',
        estimatedDeparture: old?.estimatedDeparture ?? null,
        estimatedArrival: old?.estimatedArrival ?? null,
        departureDelayMin: delay,
        arrivalDelayMin: old?.arrivalDelayMin ?? null,
        providerStatus: old?.providerStatus ?? null,
        status: change.status ?? old?.status ?? null,
        belt: change.belt ?? old?.belt ?? null,
        receivedAt: Date.now(),
      },
      change.oldGate ?? old?.gate ?? base?.gate ?? null,
    );
  }
  void syncNow();
}

/** Start the sync; returns a function that stops it. Call once from the app root. */
export function startFlightSync(): () => void {
  let timer: ReturnType<typeof setInterval> | null = null;
  const start = () => {
    if (timer) return;
    void syncNow();
    timer = setInterval(() => void syncNow(), POLL_MS);
  };
  const stop = () => {
    if (timer) clearInterval(timer);
    timer = null;
  };
  void syncReminders();
  if (AppState.currentState === 'active') start();
  const appSub = AppState.addEventListener('change', s => (s === 'active' ? start() : stop()));
  const received = Notifications.addNotificationReceivedListener(onNotification);
  const response = Notifications.addNotificationResponseReceivedListener(r => onNotification(r.notification));
  // A different active ticket: read it at once instead of waiting for the next tick.
  const unsubTickets = useTickets.subscribe((s, prev) => {
    if (s.activeTicketId !== prev.activeTicketId) {
      void syncNow();
      void syncReminders();
    }
  });
  return () => {
    stop();
    appSub.remove();
    received.remove();
    response.remove();
    unsubTickets();
  };
}
