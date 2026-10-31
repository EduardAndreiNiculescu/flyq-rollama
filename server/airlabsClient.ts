/**
 * SERVER-SIDE ONLY. The AirLabs key travels as a query parameter (`api_key`), so it must never reach
 * the app, logs, error messages or analytics. Key comes from AIRLABS_API_KEY, never from source.
 */
import { parseAirLabsFlight, readAirLabsError, type AirLabsFlight } from '../src/tracking/airlabs';

const BASE = 'https://airlabs.co/api/v9';

export type AirLabsResult =
  | { ok: true; flight: AirLabsFlight }
  | { ok: false; reason: 'not_found' | 'bad_request' | 'auth_error' | 'rate_limited' | 'provider_error' };

type FetchLike = (url: string | URL, init?: RequestInit) => Promise<Response>;

/** AirLabs error codes documented at https://airlabs.co/docs/ */
export function mapAirLabsError(code: string): Extract<AirLabsResult, { ok: false }>['reason'] {
  if (code === 'unknown_api_key' || code === 'expired_api_key') return 'auth_error';
  if (/_limit_exceeded$/.test(code)) return 'rate_limited';
  if (code === 'not_found') return 'not_found';
  if (code === 'wrong_params' || code === 'unknown_method') return 'bad_request';
  return 'provider_error';
}

export class AirLabsClient {
  constructor(
    private apiKey: string,
    private deps: { fetchImpl?: FetchLike; timeoutMs?: number; baseUrl?: string } = {},
  ) {
    if (!apiKey) throw new Error('airlabs_key_missing');
  }

  static fromEnv(env: Record<string, string | undefined> = process.env) {
    const key = env.AIRLABS_API_KEY;
    if (!key) throw new Error('airlabs_key_missing');
    return new AirLabsClient(key);
  }

  private async get(path: string, params: Record<string, string>): Promise<unknown> {
    const url = new URL(`${this.deps.baseUrl ?? BASE}/${path}`);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    url.searchParams.set('api_key', this.apiKey);
    // Errors thrown here must never include `url` (it contains the key).
    // Identify ourselves honestly: the provider's edge protection rejects the default library signatures (HTTP 403, error 1010).
    const res = await (this.deps.fetchImpl ?? fetch)(url, {
      signal: AbortSignal.timeout(this.deps.timeoutMs ?? 8000),
      headers: { 'user-agent': 'FlightFlow-dev/0.1 (hackathon prototype)', accept: 'application/json' },
    });
    if (res.status === 429) throw Object.assign(new Error('rate_limited'), { reason: 'rate_limited' });
    let json: unknown = null;
    try {
      json = await res.json();
    } catch {
      /* non-JSON body: handled below */
    }
    // The provider echoes the API key, the caller's IP and city in `request`. Drop it here so no code path can log or forward it.
    if (json && typeof json === 'object') delete (json as Record<string, unknown>).request;
    const err = readAirLabsError(json);
    if (err) throw Object.assign(new Error(err.code), { reason: mapAirLabsError(err.code) });
    if (!res.ok || json === null) throw Object.assign(new Error('provider_error'), { reason: 'provider_error' });
    return json;
  }

  /**
   * Flight info by number: IATA ("RO123", "CX253") or ICAO callsign ("ROT123", "CPA253", as flight-radar sites show them; 3 letters).
   * AirLabs returns one flight (closest live/scheduled/landed).
   */
  async getFlightByIata(flightIata: string): Promise<AirLabsResult> {
    const fn = flightIata.replace(/\s+/g, '').toUpperCase();
    if (/^[A-Z]{3}\d{1,4}[A-Z]?$/.test(fn)) return this.fetchFlight('flight', { flight_icao: fn });
    if (!/^[A-Z0-9]{2}\d{1,4}[A-Z]?$/.test(fn)) return { ok: false, reason: 'bad_request' };
    return this.fetchFlight('flight', { flight_iata: fn });
  }

  /** IATA code of an airline from its ICAO code ("CPA" -> "CX"), from the provider's airline list. Null when unknown or on any error. */
  async getAirlineIata(icao: string): Promise<string | null> {
    const code = icao.toUpperCase();
    if (!/^[A-Z]{3}$/.test(code)) return null;
    try {
      const json = (await this.get('airlines', { icao_code: code, _fields: 'iata_code,icao_code' })) as { response?: { iata_code?: unknown; icao_code?: unknown }[] };
      const hit = (json.response ?? []).find(a => a.icao_code === code);
      return typeof hit?.iata_code === 'string' && /^[A-Z0-9]{2}$/.test(hit.iata_code) ? hit.iata_code : null;
    } catch {
      return null;
    }
  }

  /** Live position of an aircraft by ICAO24 hex (via /flights). */
  async getLiveByHex(hex: string): Promise<AirLabsResult> {
    const h = hex.toLowerCase();
    if (!/^[0-9a-f]{6}$/.test(h)) return { ok: false, reason: 'bad_request' };
    return this.fetchFlight('flights', { hex: h });
  }

  private async fetchFlight(path: string, params: Record<string, string>): Promise<AirLabsResult> {
    try {
      const json = await this.get(path, params);
      // /flights returns a list under `response`; /flight returns an object. Take the first element if it is a list.
      const body = (json as { response?: unknown }).response;
      const payload = Array.isArray(body) ? { response: body[0] } : json;
      if (Array.isArray(body) && body.length === 0) return { ok: false, reason: 'not_found' };
      return { ok: true, flight: parseAirLabsFlight(payload) };
    } catch (e) {
      const reason = (e as { reason?: string }).reason;
      if (reason === 'rate_limited' || reason === 'auth_error' || reason === 'not_found' || reason === 'bad_request') return { ok: false, reason };
      return { ok: false, reason: 'provider_error' };
    }
  }
}
