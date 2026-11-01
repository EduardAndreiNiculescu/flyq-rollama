import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import { AppState } from 'react-native';
import { flightData } from '../index';
import { useLive } from '../../store/live';
import { useSettings } from '../../store/settings';
import { useTickets } from '../../store/tickets';
import { formatLocalTime } from '../../lib/time';
import { recordFor } from './DeviceAssistantService';
import { startFlightActivity } from './liveActivity';
import { FLYQ_DEMO_FLIGHT_ID, flyqFlightId, registerForFlight } from './push';

/**
 * Push registration without anyone pasting anything. The server needs, once per flight and device: the APNs device token and the flight id; the
 * Live Activity token follows by itself when the card starts (liveActivity.ts). This registers the active ticket's flight when a ticket is added
 * or scanned, when the app opens or comes back to the foreground, and when iOS hands out a new token. The app key comes from the build
 * (EXPO_PUBLIC_FLYQ_KEY, set in the build environment, never in git) unless one was entered by hand.
 */
const SIG_KEY = 'flyq.push.signature';
const BUILD_KEY = (process.env.EXPO_PUBLIC_FLYQ_KEY ?? '').trim();

let running = false;
let again = false;

/** The registration state shown nowhere in the normal UI; the test screen and the console read it. */
export let lastAutoRegister = 'not run';

export async function ensurePushRegistered(): Promise<string> {
  if (running) {
    again = true; // something changed while registering: one more pass after this one
    return lastAutoRegister;
  }
  running = true;
  try {
    const live = useLive.getState();
    if (!live.flyqKey && BUILD_KEY) live.setFlyqKey(BUILD_KEY);
    if (!useLive.getState().flyqKey) return (lastAutoRegister = 'no app key in this build');
    const s = useTickets.getState();
    const ticket = s.tickets.find(t => t.id === s.activeTicketId);
    const flight = ticket ? flightData.getFlight(ticket.flightId) : null;
    if (!ticket || !flight) return (lastAutoRegister = 'no active ticket');
    const record = recordFor(flight);
    const flightId = record.dataSource === 'demo' ? FLYQ_DEMO_FLIGHT_ID : flyqFlightId(record);
    if (!flightId) return (lastAutoRegister = 'this flight is not at Craiova: the server has no id for it');
    const signature = `${flightId}|${useSettings.getState().language}`;
    // Same flight and language as the last successful registration, and the device token has not changed (the listener clears the signature): nothing to send
    if ((await SecureStore.getItemAsync(SIG_KEY).catch(() => null)) === signature) return (lastAutoRegister = `already registered for ${flightId}`);
    const r = await registerForFlight(record, useSettings.getState().language);
    if (r.state === 'registered') {
      await SecureStore.setItemAsync(SIG_KEY, signature).catch(() => {});
      // A flight that was just registered, leaves within a day and has not landed: its lock-screen card starts now (iOS only allows that while the app is open)
      const dep = Date.parse(flight.departureUtc);
      const from = flightData.getAirport(flight.from);
      if (AppState.currentState === 'active' && from && dep - Date.now() < 24 * 3600_000 && Date.parse(flight.arrivalUtc) > Date.now()) {
        const boarding = flight.boardingUtc ? { time: formatLocalTime(flight.boardingUtc, from.utcOffsetMin), epoch: Math.floor(Date.parse(flight.boardingUtc) / 1000) } : null;
        void startFlightActivity(record, boarding).catch(() => {});
      }
      return (lastAutoRegister = `registered for ${r.flightId}`);
    }
    return (lastAutoRegister = r.state === 'error' ? `error: ${r.reason}` : r.state);
  } finally {
    running = false;
    if (again) {
      again = false;
      void ensurePushRegistered();
    }
  }
}

/** Starts the triggers; returns the function that stops them. Call once at app start. */
export function startPushRegistration(): () => void {
  const run = () => void ensurePushRegistered().catch(() => {});
  const unsubscribeTickets = useTickets.subscribe((state, prev) => {
    if (state.activeTicketId !== prev.activeTicketId && state.activeTicketId) run();
  });
  const app = AppState.addEventListener('change', st => {
    if (st === 'active') run();
  });
  const token = Notifications.addPushTokenListener(() => {
    void SecureStore.deleteItemAsync(SIG_KEY).catch(() => {}).finally(run);
  });
  run();
  return () => {
    unsubscribeTickets();
    app.remove();
    token.remove();
  };
}
