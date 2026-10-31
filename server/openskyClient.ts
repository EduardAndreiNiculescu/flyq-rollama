/**
 * SERVER-SIDE ONLY. Never import this from the React Native app: it handles the OpenSky client secret.
 * Credentials come from the environment (OPENSKY_CLIENT_ID / OPENSKY_CLIENT_SECRET), never from source.
 */
import { parseStatesResponse, type Observation } from '../src/tracking/opensky';

const TOKEN_URL = 'https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token';
const STATES_URL = 'https://opensky-network.org/api/states/all';

export type StateResult =
  | { ok: true; time: number; observations: Observation[] }
  | { ok: false; reason: 'rate_limited' | 'auth_error' | 'provider_error'; retryAfterSec?: number };

type Token = { value: string; expiresAtMs: number };
type FetchLike = (url: string | URL, init?: RequestInit) => Promise<Response>;

export class OpenSkyClient {
  private token: Token | null = null;
  private inflight: Promise<Token> | null = null; // single-flight: no token stampede

  constructor(
    private creds: { clientId: string; clientSecret: string },
    private deps: { fetchImpl?: FetchLike; nowMs?: () => number; timeoutMs?: number } = {},
  ) {}

  static fromEnv(env: Record<string, string | undefined> = process.env) {
    const clientId = env.OPENSKY_CLIENT_ID;
    const clientSecret = env.OPENSKY_CLIENT_SECRET;
    if (!clientId || !clientSecret) throw new Error('opensky_credentials_missing');
    return new OpenSkyClient({ clientId, clientSecret });
  }

  private f(url: string | URL, init: RequestInit = {}) {
    const signal = AbortSignal.timeout(this.deps.timeoutMs ?? 8000);
    return (this.deps.fetchImpl ?? fetch)(url, { ...init, signal });
  }

  private now() {
    return (this.deps.nowMs ?? Date.now)();
  }

  private async getToken(force = false): Promise<Token> {
    if (!force && this.token && this.token.expiresAtMs > this.now()) return this.token;
    if (!this.inflight) {
      this.inflight = (async () => {
        const res = await this.f(TOKEN_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            grant_type: 'client_credentials',
            client_id: this.creds.clientId,
            client_secret: this.creds.clientSecret,
          }),
        });
        if (!res.ok) throw new Error(`opensky_auth_${res.status}`); // never include the body or secret
        const j = (await res.json()) as { access_token?: unknown; expires_in?: unknown };
        if (typeof j.access_token !== 'string' || typeof j.expires_in !== 'number') throw new Error('bad_token_response');
        this.token = { value: j.access_token, expiresAtMs: this.now() + Math.max(0, j.expires_in - 30) * 1000 };
        return this.token;
      })().finally(() => {
        this.inflight = null;
      });
    }
    return this.inflight;
  }

  async getStateByIcao24(input: string): Promise<StateResult> {
    const icao24 = input.toLowerCase();
    if (!/^[0-9a-f]{6}$/.test(icao24)) throw new Error('bad_icao24');
    const url = new URL(STATES_URL);
    url.searchParams.set('icao24', icao24);
    try {
      for (let attempt = 0; attempt < 2; attempt++) {
        const token = await this.getToken(attempt > 0);
        const res = await this.f(url, { headers: { Authorization: `Bearer ${token.value}` } });
        if (res.status === 401) continue; // refresh once, retry once
        if (res.status === 429) {
          const ra = Number(res.headers.get('x-rate-limit-retry-after-seconds'));
          return { ok: false, reason: 'rate_limited', retryAfterSec: Number.isFinite(ra) ? ra : undefined };
        }
        if (res.status === 403) return { ok: false, reason: 'auth_error' };
        if (!res.ok) return { ok: false, reason: 'provider_error' };
        const parsed = parseStatesResponse(await res.json());
        return { ok: true, time: parsed.time, observations: parsed.observations.filter((o) => o.icao24 === icao24) };
      }
      return { ok: false, reason: 'auth_error' }; // second 401 = configuration problem
    } catch (e) {
      // Bad client credentials at the token endpoint are a configuration problem, not a provider outage.
      const m = /^opensky_auth_(\d+)$/.exec(e instanceof Error ? e.message : '');
      return { ok: false, reason: m && ['400', '401', '403'].includes(m[1]) ? 'auth_error' : 'provider_error' };
    }
  }
}
