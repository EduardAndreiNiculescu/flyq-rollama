import type { FlightRecord } from '../../core/types';
import { parseTrackingResult, type TrackingResult } from '../../tracking/result';
import { useLive } from '../../store/live';
import type { ToolTiming } from '../../tools/loop';

// Client of the FlightFlow test gateway (server/gateway). The app never talks to AirLabs or OpenSky: keys stay on the server.
export type GatewayError = 'unreachable' | 'unauthorized' | 'not_found' | 'upstream' | 'bad_response';

export async function gatewayCall(path: string, init: RequestInit = {}, timeoutMs = 10_000): Promise<unknown> {
  const { baseUrl, token } = useLive.getState();
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(baseUrl + path, {
      ...init,
      signal: ctl.signal,
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...(init.headers as Record<string, string> | undefined) },
    });
    if (res.status === 401) throw new Error('unauthorized' satisfies GatewayError);
    if (res.status === 404) throw new Error('not_found' satisfies GatewayError);
    if (!res.ok) throw new Error('upstream' satisfies GatewayError);
    return await res.json();
  } catch (e) {
    const known = ['unauthorized', 'not_found', 'upstream'];
    if (e instanceof Error && known.includes(e.message)) throw e;
    throw new Error('unreachable' satisfies GatewayError);
  } finally {
    clearTimeout(timer);
  }
}

export type FlightLookup = { record: FlightRecord | null; tracking: TrackingResult | null };

/** The team's FlyQ server (public host; the key is not). `GET /v1/flights/{n}?date=` answers with the same {record, tracking} as the test gateway. */
export const FLYQ_BASE = 'https://flyq-cra.duckdns.org';
const localDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

async function flyqFetch(path: string, init: RequestInit, timeoutMs = 10_000): Promise<unknown> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(FLYQ_BASE + path, { ...init, signal: ctl.signal });
    if (res.status === 401 || res.status === 403) throw new Error('unauthorized' satisfies GatewayError);
    if (res.status === 404) throw new Error('not_found' satisfies GatewayError);
    if (!res.ok) throw new Error('upstream' satisfies GatewayError);
    return await res.json();
  } catch (e) {
    if (e instanceof Error && ['unauthorized', 'not_found', 'upstream'].includes(e.message)) throw e;
    throw new Error('unreachable' satisfies GatewayError);
  } finally {
    clearTimeout(timer);
  }
}

/** One session per install (re-created when it expires); the app key is only sent to create it. */
async function flyqToken(force = false): Promise<string> {
  const { flyqKey, flyqSession, setFlyqSession } = useLive.getState();
  if (!flyqKey) throw new Error('unauthorized' satisfies GatewayError);
  if (!force && flyqSession && Date.parse(flyqSession.expiresAt) - Date.now() > 60_000) return flyqSession.token;
  const j = (await flyqFetch('/v1/sessions', { method: 'POST', headers: { 'X-FlyQ-App-Key': flyqKey } })) as { token?: unknown; expiresAt?: unknown };
  if (typeof j.token !== 'string' || typeof j.expiresAt !== 'string') throw new Error('bad_response' satisfies GatewayError);
  setFlyqSession({ token: j.token, expiresAt: j.expiresAt });
  return j.token;
}

export async function flyqFlight(flightNumber: string, now: Date = new Date()): Promise<unknown> {
  const path = `/v1/flights/${encodeURIComponent(flightNumber.replace(/\s+/g, ''))}?date=${localDate(now)}`;
  const call = async (force: boolean) => flyqFetch(path, { headers: { authorization: `Bearer ${await flyqToken(force)}` } });
  try {
    return await call(false);
  } catch (e) {
    if (e instanceof Error && e.message === 'unauthorized') return call(true); // expired session: one fresh one, once
    throw e;
  }
}

export async function fetchFlight(flightNumber: string): Promise<FlightLookup> {
  const j = (useLive.getState().backend === 'flyq' ? await flyqFlight(flightNumber) : await gatewayCall(`/v1/flight/${encodeURIComponent(flightNumber.replace(/\s+/g, ''))}`)) as { record?: FlightRecord | null; tracking?: unknown };
  let tracking: TrackingResult | null = null;
  try {
    tracking = j.tracking ? parseTrackingResult(j.tracking) : null;
  } catch {
    tracking = null; // a malformed position is dropped, never guessed
  }
  return { record: j.record ?? null, tracking };
}

export type LaptopAnswer = { text: string; tools: string[]; ms: number };
export async function askLaptop(question: string, flightNumber?: string): Promise<LaptopAnswer> {
  const j = (await gatewayCall('/v1/chat', { method: 'POST', body: JSON.stringify({ question, ...(flightNumber ? { flightNumber } : {}) }) }, 90_000)) as { text?: unknown; trace?: { name?: string }[]; ms?: number };
  if (typeof j.text !== 'string') throw new Error('bad_response' satisfies GatewayError);
  return { text: j.text, tools: (j.trace ?? []).map(t => String(t.name)), ms: typeof j.ms === 'number' ? j.ms : 0 };
}

/** Health (no token) then an authenticated call, so a wrong token is reported as such. */
export async function pingGateway(): Promise<{ ok: boolean; detail: string }> {
  try {
    await gatewayCall('/health', {}, 5000);
  } catch {
    return { ok: false, detail: 'Gateway-ul nu răspunde. Pornit pe laptop (npm run gateway)? Adresa și rețeaua sunt corecte?' };
  }
  try {
    await gatewayCall('/v1/tools', {}, 5000);
    return { ok: true, detail: 'Conectat.' };
  } catch (e) {
    return { ok: false, detail: e instanceof Error && e.message === 'unauthorized' ? 'Gateway-ul răspunde, dar tokenul e greșit.' : 'Gateway-ul răspunde, dar a dat o eroare.' };
  }
}

export type BenchItem = { q: string; answer: string; ms: number; mode: string; modelUsed: boolean; path?: 'fast' | 'composed' | 'model'; timing?: ToolTiming; tokensPerSecond: number | null; ttftMs: number | null; tools: string[] };

/** Sends the benchmark to the laptop, which saves it as eval/results/phone-bench-*.json. */
export async function sendBench(meta: Record<string, unknown>, items: BenchItem[]): Promise<string> {
  const j = (await gatewayCall('/v1/bench', { method: 'POST', body: JSON.stringify({ ...meta, items }) })) as { saved?: string };
  return j.saved ?? 'salvat';
}
