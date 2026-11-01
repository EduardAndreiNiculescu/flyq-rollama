/**
 * Minimal client for the FlyQ backend (FlyQ-backend/server). Offline-first: every call can fail
 * and the app keeps working without it.
 */
import { appKey as readAppKey, DEMO_SCENARIO } from '../config';
import { backendBaseUrl } from './backendUrl';

export interface LocalizedName {
  ro: string;
  en: string;
}

export interface AirportRef {
  iata: string;
  name: LocalizedName | null;
}

export interface Flight {
  id: string;
  kind: 'departure' | 'arrival';
  flightCode: string;
  origin: AirportRef;
  destination: AirportRef;
  isNonSchengen: boolean;
  times: { scheduled: string; estimated: string | null; actual: string | null };
  delayMinutes: number | null;
  isDelayed: boolean;
  status: string;
  gate: string | null;
}

export interface Health {
  status: string;
  version: string;
  commit: string;
  time: string;
}

export class BackendError extends Error {
  readonly code: string;
  readonly status: number | null;

  constructor(code: string, message: string, status: number | null = null) {
    super(message);
    this.name = 'BackendError';
    this.code = code;
    this.status = status;
  }
}

async function getJson<T>(
  path: string,
  options: { timeoutMs?: number; appKey?: boolean } = {},
): Promise<T> {
  const { timeoutMs = 4000, appKey = true } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Accept-Language': 'ro',
  };
  if (appKey) {
    headers['X-FlyQ-App-Key'] = readAppKey();
  }
  let response: Response;
  try {
    response = await fetch(`${backendBaseUrl()}${path}`, {
      headers,
      signal: controller.signal,
    });
  } catch (error) {
    const aborted = controller.signal.aborted;
    throw new BackendError(
      aborted ? 'TIMEOUT' : 'NETWORK',
      aborted ? 'The backend did not answer in time.' : String(error),
    );
  } finally {
    clearTimeout(timer);
  }
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  if (!response.ok) {
    const err = (body as { error?: { code?: string; message?: string } } | null)
      ?.error;
    throw new BackendError(
      err?.code ?? `HTTP_${response.status}`,
      err?.message ?? response.statusText,
      response.status,
    );
  }
  return body as T;
}

export function getHealth(): Promise<Health> {
  return getJson<Health>('/v1/health', { appKey: false, timeoutMs: 3000 });
}

/** Picks the flight to show: first departure, else the first flight. */
export function pickFlight(flights: Flight[]): Flight | null {
  return flights.find(f => f.kind === 'departure') ?? flights[0] ?? null;
}

export async function getDemoFlight(
  scenario: string = DEMO_SCENARIO,
): Promise<Flight | null> {
  const board = await getJson<{ flights?: Flight[] }>(
    `/v1/demo/flights?scenario=${encodeURIComponent(scenario)}`,
  );
  return pickFlight(Array.isArray(board.flights) ? board.flights : []);
}
