import * as Notifications from 'expo-notifications';
import { AppState } from 'react-native';
import type { FlightRecord } from '../../core/types';
import { useFlightStatus, type FlightOverlay } from '../../store/flightStatus';
import { useLive } from '../../store/live';
import { useTickets } from '../../store/tickets';
import { flightData } from '../index';
import { fetchFlight } from './gatewayClient';
import { refreshFlightActivity } from './liveActivity';
import { buildLiveEntry, getLiveEntry, isLiveFlightId, registerLive } from './liveFlights';
import { syncReminders } from './localReminders';
import { gateFromNotificationText } from './notificationGate';
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
  store.apply(flightId, overlayFrom(record), previousGate === '—' ? null : previousGate);
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
  const data = (content.data ?? {}) as Record<string, unknown>;
  // If the push carries the new gate in its data, use it right away; otherwise read the server.
  const gate = typeof data.gate === 'string' ? data.gate : typeof data.newGate === 'string' ? data.newGate : null;
  const target = syncTarget();
  if (target && gate) {
    const overlay = useFlightStatus.getState().overlays[target.flightId];
    const base = flightData.getFlight(target.flightId);
    useFlightStatus.getState().apply(target.flightId, { ...(overlay ?? overlayFrom({ flightNumber: target.number, departureAirport: '', arrivalAirport: '', scheduledDeparture: '', scheduledArrival: '', gate: null, gateStatus: 'unconfirmed', dataSource: 'demo', lastUpdated: null })), gate, gateStatus: 'confirmed', receivedAt: Date.now() }, overlay?.gate ?? base?.gate ?? null);
  } else if (target && !isLiveFlightId(target.flightId)) {
    const text = `${content.title ?? ''} ${content.body ?? ''}`;
    const fromText = gateFromNotificationText(text);
    if (fromText && /poart|gate/i.test(text)) {
      const overlay = useFlightStatus.getState().overlays[target.flightId];
      const base = flightData.getFlight(target.flightId);
      useFlightStatus.getState().apply(target.flightId, { gate: fromText, gateStatus: 'confirmed', estimatedDeparture: overlay?.estimatedDeparture ?? null, estimatedArrival: overlay?.estimatedArrival ?? null, departureDelayMin: overlay?.departureDelayMin ?? null, arrivalDelayMin: overlay?.arrivalDelayMin ?? null, providerStatus: overlay?.providerStatus ?? null, receivedAt: Date.now() }, overlay?.gate ?? base?.gate ?? null);
    }
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
