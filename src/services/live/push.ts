import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import type { FlightRecord } from '../../core/types';
import { useLive } from '../../store/live';
import { FLYQ_BASE } from './gatewayClient';

/**
 * Push notifications through the FlyQ server (POST /v1/push/subscriptions). The server sends them over APNs; this file only
 * asks for permission, reads the native APNs token and registers it. The server needs PUSH_ENABLED and the APNs key on its side
 * (not configured here): until then it answers 422 FEATURE_DISABLED, which is reported as "server push is off", not as an error.
 */
export type PushResult =
  | { state: 'registered'; subscriptionId: string; flightId: string; token: string }
  | { state: 'denied' }
  | { state: 'server_off'; token: string }
  | { state: 'no_key' }
  | { state: 'error'; reason: string };

const OWNER_KEY = 'flyq.push.owner';
/** A flight the FlyQ server always has (its demo scenarios), documented in the backend's RUNBOOK and tests. */
export const FLYQ_DEMO_FLIGHT_ID = 'DEMO-gate_change-D-W69901';

/** Flight ids in the FlyQ panel look like CRA-D-W43763-20261030 (airport, D/A, number, date); built here from the record. */
export function flyqFlightId(record: FlightRecord): string | null {
  const day = /^(\d{4})-(\d{2})-(\d{2})/.exec(record.scheduledDeparture);
  if (!day) return null;
  const dir = record.departureAirport === 'CRA' ? 'D' : record.arrivalAirport === 'CRA' ? 'A' : null;
  if (!dir) return null;
  return `CRA-${dir}-${record.flightNumber.replace(/\s+/g, '').toUpperCase()}-${day[1]}${day[2]}${day[3]}`;
}

/** Builds installed from Xcode use the APNs sandbox; TestFlight and App Store builds use production. A wrong value gives BadDeviceToken. */
export const pushEnvironment = (): 'sandbox' | 'production' => 'sandbox'; // this app is only installed from Xcode (development signing); TestFlight would need 'production'

/** The native APNs token (hex). Null when the user did not allow notifications or this is not an iPhone. */
export async function deviceToken(): Promise<string | null> {
  if (Platform.OS !== 'ios') return null;
  const perm = await Notifications.getPermissionsAsync();
  const granted = perm.granted || (await Notifications.requestPermissionsAsync()).granted;
  if (!granted) return null;
  const t = await Notifications.getDevicePushTokenAsync();
  return typeof t.data === 'string' ? t.data : null;
}

/** The server's own error code (APP_KEY_INVALID, APP_KEY_MISSING, FLIGHT_NOT_FOUND, ...), so a bare "401" is not all the test screen shows. */
async function errorCode(res: Response): Promise<string> {
  try {
    return ((await res.json()) as { error?: { code?: string } }).error?.code ?? '';
  } catch {
    return '';
  }
}

/** Asks a free demo endpoint with the stored app key, and says what the server answered. Shows the key's length, never the key. */
export async function testFlyqKey(): Promise<string> {
  const { flyqKey } = useLive.getState();
  if (!flyqKey) return 'Nu e nicio cheie setată.';
  try {
    const res = await fetch(`${FLYQ_BASE}/v1/demo/scenarios`, { headers: { 'X-FlyQ-App-Key': flyqKey } });
    return res.ok ? `Cheia e acceptată (HTTP ${res.status}, ${flyqKey.length} caractere).` : `Respinsă: HTTP ${res.status} ${await errorCode(res)} (cheia salvată are ${flyqKey.length} caractere).`;
  } catch {
    return 'Serverul nu răspunde (rețea?).';
  }
}

export async function registerForFlight(record: FlightRecord, locale: 'ro' | 'en'): Promise<PushResult> {
  const { flyqKey } = useLive.getState();
  if (!flyqKey) return { state: 'no_key' };
  // The ticket's own flight is fictional (demo data), so the server has no such flight: subscribe to one of the server's demo flights instead,
  // which also lets the admin send it demo events (gate change, delay) for testing.
  const flightId = record.dataSource === 'demo' ? FLYQ_DEMO_FLIGHT_ID : flyqFlightId(record);
  if (!flightId) return { state: 'error', reason: 'this flight is not at Craiova, the server has no id for it' };
  let token: string | null;
  try {
    token = await deviceToken();
  } catch (e) {
    return { state: 'error', reason: `no APNs token: ${String(e)}` };
  }
  if (!token) return { state: 'denied' };
  try {
    const res = await fetch(`${FLYQ_BASE}/v1/push/subscriptions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'X-FlyQ-App-Key': flyqKey },
      body: JSON.stringify({ deviceToken: token, environment: pushEnvironment(), flightId, locale }),
    });
    if (res.status === 422) return { state: 'server_off', token };
    if (!res.ok) return { state: 'error', reason: `server answered ${res.status} ${await errorCode(res)}`.trim() };
    const j = (await res.json()) as { subscriptionId?: unknown; ownerToken?: unknown };
    if (typeof j.subscriptionId !== 'string' || typeof j.ownerToken !== 'string') return { state: 'error', reason: 'unexpected server answer' };
    await SecureStore.setItemAsync(OWNER_KEY, JSON.stringify({ id: j.subscriptionId, owner: j.ownerToken })); // the only way to change or delete it later
    return { state: 'registered', subscriptionId: j.subscriptionId, flightId, token };
  } catch {
    return { state: 'error', reason: 'server unreachable' };
  }
}

/** Show notifications that arrive while the app is open (iOS hides them by default). Call once at start. */
export function initNotifications() {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
  });
}
