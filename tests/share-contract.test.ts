import { readFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createShareServer, flightState } from '../scripts/share-dev-server.mjs';

let now = Date.parse('2026-11-01T06:00:00Z');
const server = createShareServer({ now: () => now });
let base = '';
beforeAll(async () => {
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => server.close());

const auth = { authorization: 'Bearer dev-session', 'content-type': 'application/json' };
const create = async (flightNumber = 'W69901') =>
  (await (await fetch(`${base}/v1/shares`, { method: 'POST', headers: auth, body: JSON.stringify({ flightNumber, date: '2026-11-01' }) })).json()) as { shareId: string; url: string; expiresAt: string };
const tokenOf = (url: string) => url.split('/s/')[1];

describe('share-flight contract (docs/SHARE_FLIGHT.md)', () => {
  it('creates a link with an unguessable token and an expiry', async () => {
    const s = await create();
    expect(tokenOf(s.url)).toMatch(/^[A-Za-z0-9_-]{22,}$/); // at least 128 bits in base64url
    expect(Date.parse(s.expiresAt)).toBeGreaterThan(now);
  });

  it('refuses to create or delete without the session', async () => {
    expect((await fetch(`${base}/v1/shares`, { method: 'POST', body: '{}' })).status).toBe(401);
    expect((await fetch(`${base}/v1/shares/0123456789abcdef`, { method: 'DELETE' })).status).toBe(401);
  });

  it('serves the public read without any login, with the privacy headers, and nothing about the passenger', async () => {
    const s = await create();
    const res = await fetch(`${base}/v1/public/shares/${tokenOf(s.url)}`);
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(res.headers.get('x-robots-tag')).toMatch(/noindex/);
    const body = (await res.json()) as Record<string, unknown>;
    const text = JSON.stringify(body).toLowerCase();
    for (const forbidden of ['passenger', 'pnr', 'seat', 'barcode', 'userid', 'devicetoken', 'ownertoken', 'email']) expect(text).not.toContain(forbidden);
    expect(body).toMatchObject({ flightNumber: 'W69901', status: 'in_air' }); // the fields the page reads
    expect((body.from as { lat: number }).lat).toBeTypeOf('number');
    expect((body.position as { lat: number }).lat).toBeTypeOf('number');
  });

  it('the page draws a flight whose airports come without coordinates (null) from its own airport table', () => {
    const html = readFileSync(new URL('../web/share/index.html', import.meta.url), 'utf8');
    const f = flightState(1_000_000, 'W69901', true) as { from: { lat: number | null }; demo?: boolean };
    expect(f.from.lat).toBeNull();
    expect(f.demo).toBe(true);
    const table = JSON.parse(/var AIRPORTS = (\{.*?\});/.exec(html)![1]!) as Record<string, number[]>;
    for (const code of ['CRA', 'LTN', 'OTP', 'CDG']) expect(table[code]).toHaveLength(2);
    expect(html).toContain('typeof j.from.code'); // parse() requires the codes, not the coordinates
    expect(html).not.toMatch(/typeof j\.from\.lat/);
  });

  it('answers 404 identically for an unknown, expired and revoked token', async () => {
    const expired = await create();
    const revoked = await create();
    expect((await fetch(`${base}/v1/shares/${revoked.shareId}`, { method: 'DELETE', headers: auth })).status).toBe(204);
    now += 4 * 3600_000; // past the 3 h expiry
    const unknown = await fetch(`${base}/v1/public/shares/${'x'.repeat(22)}`);
    const a = await fetch(`${base}/v1/public/shares/${tokenOf(expired.url)}`);
    const b = await fetch(`${base}/v1/public/shares/${tokenOf(revoked.url)}`);
    for (const r of [unknown, a, b]) expect(r.status).toBe(404);
    expect(await a.text()).toBe(await b.text());
    now = Date.parse('2026-11-01T06:00:00Z');
  });

  it('serves the page at /s/{token}', async () => {
    const s = await create();
    const res = await fetch(`${base}/s/${tokenOf(s.url)}`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/text\/html/);
    expect(await res.text()).toContain('/v1/public/shares/');
  });

  it('simulates a flight whose position moves from Craiova towards Luton', () => {
    const early = flightState(1_000_000);
    const late = flightState(1_000_000 + 120_000);
    expect(late.position.lat).not.toBe(early.position.lat);
  });
});
