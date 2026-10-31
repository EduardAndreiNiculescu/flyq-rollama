/**
 * Send FlyQ push notifications to your own phone from the laptop (needs the server's admin token).
 *
 *   npx tsx scripts/push.mts test "Titlu" "Mesaj"
 *   npx tsx scripts/push.mts event gate_changed --gate 3 --old 2
 *   npx tsx scripts/push.mts event delay_changed --delay 25
 *   npx tsx scripts/push.mts event boarding_started
 *   npx tsx scripts/push.mts demo            (boarding, gate change, delay, gate closing: one every 4 seconds, for the stage)
 *
 * Secrets: FLYQ_ADMIN_TOKEN (the server's admin token, from whoever runs the server) and DEVICE_TOKEN (shown in the app: Profil > Mod test >
 * "Activeaza notificarile") are read from the environment or from a file named `.env.local` in the project folder (git ignores it; see
 * scripts/push.env.example). They are never printed and never sent anywhere except to the FlyQ server.
 * `test` goes straight to your phone. `event` fires a demo event for the demo flight the app subscribed to (DEMO-...), and the server notifies its subscribers.
 */
import { existsSync, readFileSync } from 'node:fs';

const env: Record<string, string> = {};
if (existsSync('.env.local')) {
  for (const raw of readFileSync('.env.local', 'utf8').split(String.fromCharCode(10))) {
    const m = /^([A-Z_]+)=(.*)$/.exec(raw.trim());
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
const get = (k: string) => process.env[k] ?? env[k];
const base = get('FLYQ_BASE') ?? 'https://flyq-cra.duckdns.org';
const admin = get('FLYQ_ADMIN_TOKEN');
const device = get('DEVICE_TOKEN');
const flightId = get('DEMO_FLIGHT_ID') ?? 'DEMO-gate_change-D-W69901';
const environment = get('PUSH_ENV') === 'production' ? 'production' : 'sandbox';

const [cmd = '', ...rest] = process.argv.slice(2);
const flag = (name: string) => {
  const i = rest.indexOf(`--${name}`);
  return i >= 0 ? rest[i + 1] : undefined;
};

async function call(path: string, body: unknown) {
  const res = await fetch(`${base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${admin}` }, body: JSON.stringify(body) });
  const j = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { http: res.status, ...(j.outcome !== undefined ? { outcome: j.outcome } : {}), ...(j.status !== undefined ? { status: j.status } : {}), ...(j.reason !== undefined ? { reason: j.reason } : {}), ...(j.error !== undefined ? { error: j.error } : {}), ...(j.sent !== undefined ? { sent: j.sent } : {}) };
}

async function event(name: string, data: Record<string, unknown> = {}) {
  const r = await call('/v1/admin/demo/events', { flightId, event: name, data });
  console.log(name, JSON.stringify(r));
  return r.http === 200;
}

if (!admin) {
  console.error('Lipseste FLYQ_ADMIN_TOKEN (tokenul de admin al serverului): pune-l in .env.local sau in mediu. Il are cine administreaza serverul.');
  process.exit(2);
}
if (cmd === 'test') {
  if (!device) {
    console.error('Lipseste DEVICE_TOKEN (il arata aplicatia dupa "Activeaza notificarile").');
    process.exit(2);
  }
  const [title = 'FlightFlow', body = 'Test notification'] = rest;
  const r = await call('/v1/admin/push/test', { deviceToken: device, environment, title, body });
  console.log(JSON.stringify(r));
  process.exit(r.http === 200 ? 0 : 1);
} else if (cmd === 'event') {
  const name = rest[0];
  if (!name) {
    console.error('Spune evenimentul: gate_assigned gate_changed checkin_open boarding_started gate_closing_soon delay_changed cancelled diverted landed baggage_belt_assigned');
    process.exit(2);
  }
  const data: Record<string, unknown> = {};
  if (flag('gate')) data.gate = flag('gate');
  if (flag('old')) data.oldGate = flag('old');
  if (flag('belt')) data.baggageBelt = flag('belt');
  if (flag('delay')) data.delayMinutes = Number(flag('delay'));
  process.exit((await event(name, data)) ? 0 : 1);
} else if (cmd === 'demo') {
  const steps: Array<[string, Record<string, unknown>]> = [['boarding_started', {}], ['gate_changed', { gate: '3', oldGate: '2' }], ['delay_changed', { delayMinutes: 25 }], ['gate_closing_soon', {}]];
  for (const [name, data] of steps) {
    if (!(await event(name, data))) process.exit(1);
    await new Promise((r) => setTimeout(r, 4000));
  }
} else {
  console.error('Comenzi: test "Titlu" "Mesaj" | event <nume> [--gate 3 --old 2 --delay 25 --belt 1] | demo');
  process.exit(2);
}
