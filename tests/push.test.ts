import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flyqFlightId, registerForFlight } from '../src/services/live/push';
import { useLive } from '../src/store/live';

vi.mock('react-native', () => ({ Platform: { OS: 'ios' } }));
vi.mock('../src/store/storage', () => ({ zustandStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} } }));
const store: Record<string, string> = {};
vi.mock('expo-secure-store', () => ({ setItemAsync: async (k: string, v: string) => void (store[k] = v) }));
let granted = true;
vi.mock('expo-notifications', () => ({
  getPermissionsAsync: async () => ({ granted }),
  requestPermissionsAsync: async () => ({ granted }),
  getDevicePushTokenAsync: async () => ({ data: 'ab12cd34'.repeat(8) }),
  setNotificationHandler: () => {},
}));

const rec = { flightNumber: 'W4 3763', departureAirport: 'CRA', arrivalAirport: 'BGY', scheduledDeparture: '2026-10-30T12:45:00+02:00', scheduledArrival: '2026-10-30T14:10:00+01:00', gate: null, gateStatus: 'unconfirmed', dataSource: 'airlabs', lastUpdated: null } as const;
let status = 201;
const sent: Array<{ url: string; body: Record<string, unknown>; headers: Record<string, string> }> = [];

beforeEach(() => {
  granted = true;
  status = 201;
  sent.length = 0;
  useLive.setState({ flyqKey: 'test-key-not-real' });
  vi.stubGlobal('fetch', async (url: string, init: { body: string; headers: Record<string, string> }) => {
    sent.push({ url, body: JSON.parse(init.body), headers: init.headers });
    return { ok: status < 300, status, json: async () => ({ subscriptionId: 'sub_1', ownerToken: 'own_1' }) };
  });
});

describe('push registration', () => {
  it('builds the FlyQ panel id from the record', () => {
    expect(flyqFlightId(rec)).toBe('CRA-D-W43763-20261030');
    expect(flyqFlightId({ ...rec, departureAirport: 'BGY', arrivalAirport: 'CRA' })).toBe('CRA-A-W43763-20261030');
    expect(flyqFlightId({ ...rec, departureAirport: 'BGY', arrivalAirport: 'LTN' })).toBeNull();
  });
  it('registers the APNs token with the strict body the server accepts (no bundleId) and keeps the owner token in the keychain', async () => {
    const r = await registerForFlight(rec, 'ro');
    expect(r).toMatchObject({ state: 'registered', subscriptionId: 'sub_1', flightId: 'CRA-D-W43763-20261030' });
    expect(Object.keys(sent[0].body).sort()).toEqual(['deviceToken', 'environment', 'flightId', 'locale']);
    expect(sent[0].body.environment).toBe('sandbox');
    expect(sent[0].headers['X-FlyQ-App-Key']).toBe('test-key-not-real');
    expect(store['flyq.push.owner']).toContain('own_1');
  });
  it('422 means the server has push off: reported as such, token still returned', async () => {
    status = 422;
    expect(await registerForFlight(rec, 'en')).toMatchObject({ state: 'server_off' });
  });
  it('without permission or without a key nothing is sent', async () => {
    granted = false;
    expect(await registerForFlight(rec, 'ro')).toEqual({ state: 'denied' });
    useLive.setState({ flyqKey: '' });
    expect(await registerForFlight(rec, 'ro')).toEqual({ state: 'no_key' });
    expect(sent).toHaveLength(0);
  });
});
