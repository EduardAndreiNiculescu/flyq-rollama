// Reference implementation of the share-flight API (docs/SHARE_FLIGHT.md section 3), in memory and without dependencies. It is NOT the production
// server (that lives in FlyQ-backend): it exists to run the web page against the real contract and to test that contract.
//   node scripts/share-dev-server.mjs [port]
// then create a link with POST /v1/shares (Authorization: Bearer dev-session) and open the returned URL.
import { randomBytes, createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const PAGE = fileURLToPath(new URL('../web/share/index.html', import.meta.url));
const HEADERS = { 'x-robots-tag': 'noindex, nofollow', 'cache-control': 'no-store', 'referrer-policy': 'strict-origin-when-cross-origin', 'x-content-type-options': 'nosniff' };
const hash = t => createHash('sha256').update(t).digest('hex');

const A = { code: 'CRA', city: 'Craiova', lat: 44.3181, lon: 23.8886 };
const B = { code: 'LTN', city: 'Londra Luton', lat: 51.8747, lon: -0.3683 };

/** A simulated flight for the shared token: only flight facts, never anything about the passenger. */
/** `bare`: like the real server today, the airports come without coordinates and the flight is marked demo (the page must still draw the route) */
export function flightState(nowMs, flightNumber = 'W69901', bare = false) {
  const cycle = 240; // seconds for the whole route, so a demo moves visibly
  const f = ((nowMs / 1000) % cycle) / cycle;
  return {
    flightNumber, from: bare ? { ...A, lat: null, lon: null } : A, to: bare ? { ...B, lat: null, lon: null } : B, ...(bare ? { demo: true } : {}), status: 'in_air', gate: '3',
    scheduledDeparture: '2026-11-01T08:40:00+02:00', scheduledArrival: '2026-11-01T10:05:00+00:00',
    eta: { epoch: Math.floor(nowMs / 1000 + (1 - f) * 8700), kind: 'position_estimate' }, progress: f,
    position: { lat: A.lat + (B.lat - A.lat) * f, lon: A.lon + (B.lon - A.lon) * f, headingDeg: 300, altitudeM: 10600, groundSpeedMps: 230, observedAtSec: Math.floor(nowMs / 1000) },
    updatedAt: Math.floor(nowMs / 1000), attribution: 'Weather data by Open-Meteo.com (CC BY 4.0)',
  };
}

export function createShareServer({ now = () => Date.now(), session = 'dev-session', ttlMs = 3 * 3600_000, bare = false } = {}) {
  const shares = new Map(); // token hash -> { id, flightNumber, expiresAt, revokedAt }
  const byId = new Map(); // id -> token hash
  const send = (res, status, body, type = 'application/json') => {
    res.writeHead(status, { ...HEADERS, 'content-type': type });
    res.end(body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body));
  };
  const authed = req => req.headers.authorization === 'Bearer ' + session;
  const readJson = req => new Promise(resolve => {
    let b = '';
    req.on('data', c => (b += c));
    req.on('end', () => {
      try {
        resolve(JSON.parse(b || '{}'));
      } catch {
        resolve(null);
      }
    });
  });

  return createServer(async (req, res) => {
    const path = new URL(req.url, 'http://x').pathname;
    if (req.method === 'POST' && path === '/v1/shares') {
      if (!authed(req)) return send(res, 401, { error: 'unauthorized' });
      const body = await readJson(req);
      if (!body || typeof body.flightNumber !== 'string' || !/^[A-Z0-9]{2,3}\d{1,4}[A-Z]?$/.test(body.flightNumber)) return send(res, 400, { error: 'bad_request' });
      const token = randomBytes(16).toString('base64url'); // 128 bits, 22 characters
      const id = randomBytes(8).toString('hex');
      const expiresAt = now() + ttlMs;
      shares.set(hash(token), { id, flightNumber: body.flightNumber, expiresAt, revokedAt: null });
      byId.set(id, hash(token));
      return send(res, 201, { shareId: id, url: 'http://' + (req.headers.host ?? 'localhost') + '/s/' + token, expiresAt: new Date(expiresAt).toISOString() });
    }
    const del = /^\/v1\/shares\/([a-f0-9]{16})$/.exec(path);
    if (req.method === 'DELETE' && del) {
      if (!authed(req)) return send(res, 401, { error: 'unauthorized' });
      const h = byId.get(del[1]);
      const s = h && shares.get(h);
      if (!s) return send(res, 404, { error: 'not_found' });
      s.revokedAt = now();
      return send(res, 204);
    }
    const pub = /^\/v1\/public\/shares\/([A-Za-z0-9_-]{16,128})$/.exec(path);
    if (req.method === 'GET' && pub) {
      const s = shares.get(hash(pub[1]));
      // The same answer for an unknown, expired or revoked token: nothing tells them apart.
      if (!s || s.revokedAt !== null || s.expiresAt <= now()) return send(res, 404, { error: 'not_found' });
      return send(res, 200, flightState(now(), s.flightNumber, bare));
    }
    if (req.method === 'GET' && (path === '/test' || path === '/testing')) return send(res, 200, readFileSync(PAGE, 'utf8'), 'text/html; charset=utf-8');
    if (req.method === 'GET' && /^\/s\/[A-Za-z0-9_-]{16,128}$/.test(path)) return send(res, 200, readFileSync(PAGE, 'utf8'), 'text/html; charset=utf-8');
    return send(res, 404, { error: 'not_found' });
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const port = Number(process.argv[2] ?? 8787);
  createShareServer({ bare: process.argv.includes('--bare') }).listen(port, '127.0.0.1', () => console.log('share dev server on http://127.0.0.1:' + port + ' (Bearer dev-session for POST/DELETE)'));
}
