/**
 * Round-robin over several real flights: for each question template, every flight takes a turn as THE selected flight,
 * so consecutive requests switch flights. Checks, per request: the right tool, the flightNumber argument (must be the selected or the named flight),
 * flight codes in the answer (must be the selected/named one or its alias), and what the model does when the provider cannot resolve the flight.
 *   GATEWAY_TOKEN=... npx tsx scripts/flight-rotation.ts ABB864 CPA253 QTR037 [--aliases ABB864=KF864,CPA253=CX253,QTR037=QR37]
 */
import { mkdirSync, writeFileSync } from 'node:fs';

const base = process.env.GATEWAY_URL ?? 'http://127.0.0.1:18090';
const token = process.env.GATEWAY_TOKEN ?? '';
const args = process.argv.slice(2);
const aliasFlag = args.indexOf('--aliases');
const flights = args.filter((a, i) => !a.startsWith('--') && i !== aliasFlag + 1);
const aliases = new Map<string, string[]>();
if (aliasFlag >= 0) for (const p of args[aliasFlag + 1].split(',')) { const [a, b] = p.split('='); aliases.set(a, [...(aliases.get(a) ?? []), b]); aliases.set(b, [...(aliases.get(b) ?? []), a]); }

const F = 'get_flight_details', G = 'get_gate', R = 'get_time_remaining', T = 'get_live_tracking';
const TEMPLATES: { q: string; named: boolean; expect: string[] }[] = [
  { q: 'Când aterizează {FN}?', named: true, expect: [F, R] },
  { q: 'La ce poartă e {FN}?', named: true, expect: [G, F] },
  { q: 'Unde e {FN} acum?', named: true, expect: [T] },
  { q: 'Is {FN} delayed?', named: true, expect: [F, T] },
  { q: 'When does {FN} depart?', named: true, expect: [F] },
  { q: 'Cât durează zborul {FN}?', named: true, expect: [F] },
  { q: 'What gate is {FN} at?', named: true, expect: [G, F] },
  { q: 'Când aterizez?', named: false, expect: [F, R] },
  { q: 'La ce poartă sunt?', named: false, expect: [G, F] },
  { q: 'Unde e avionul acum?', named: false, expect: [T] },
  { q: 'Am întârziere?', named: false, expect: [F, T] },
  { q: 'When do we land?', named: false, expect: [F, R] },
  { q: 'How fast are we going?', named: false, expect: [T] },
  { q: 'Cât mai e până aterizăm?', named: false, expect: [R, T] },
];

const norm = (s: string) => s.replace(/\s+/g, '').toUpperCase();
const CODE = /\b[A-Z]{2,3}\s?\d{2,4}\b/g;

async function main() {
  if (!flights.length) throw new Error('give flight numbers');
  const rows: any[] = [];
  for (const tpl of TEMPLATES) {
    for (const f of flights) {
      const q = tpl.q.replace('{FN}', f);
      const t0 = Date.now();
      let j: any = {};
      let status = 0;
      try {
        const res = await fetch(`${base}/v1/chat`, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ question: q, flightNumber: f }) });
        status = res.status;
        j = await res.json();
      } catch (e) {
        j = { error: String(e) };
      }
      const trace: { name: string; args: string; ok: boolean }[] = j.trace ?? [];
      const first = trace[0];
      let toolArgs: Record<string, unknown> = {};
      try { toolArgs = first ? JSON.parse(first.args) : {}; } catch { /* truncated args */ }
      const allowed = new Set([norm(f), ...(aliases.get(f) ?? []).map(norm)]);
      const argFn = typeof toolArgs.flightNumber === 'string' ? norm(toolArgs.flightNumber) : null;
      const argOk = argFn === null || allowed.has(argFn);
      const answer: string = String(j.text ?? '');
      const mentioned = (answer.match(CODE) ?? []).map(norm);
      const foreign = mentioned.filter((c) => !allowed.has(c));
      const toolOk = !!first && tpl.expect.includes(first.name);
      rows.push({ flight: f, q, named: tpl.named, tool: first?.name ?? null, toolOk, args: first?.args ?? null, argOk, toolFailed: trace.some((t) => !t.ok), foreignCodes: foreign, answer: answer.slice(0, 220), ms: Date.now() - t0, status });
      console.log(`${(rows.length + '').padStart(3)} ${f.padEnd(7)} ${toolOk ? 'ok' : 'NU'} ${argOk ? '  ' : 'ARG'} ${foreign.length ? 'COD:' + foreign.join(',') : '        '} [${first?.name ?? '-'}${first ? ' ' + first.args : ''}] ${q}`);
    }
  }
  console.log('\n=== pe zbor ===');
  const summary: Record<string, unknown> = {};
  for (const f of flights) {
    const r = rows.filter((x) => x.flight === f);
    const s = { n: r.length, toolOk: r.filter((x) => x.toolOk).length, argWrong: r.filter((x) => !x.argOk).length, foreignCode: r.filter((x) => x.foreignCodes.length).length, providerFailed: r.filter((x) => x.toolFailed).length, medianMs: [...r.map((x) => x.ms)].sort((a, b) => a - b)[Math.floor(r.length / 2)] };
    summary[f] = s;
    console.log(`${f.padEnd(7)} unealta corectă ${s.toolOk}/${s.n} · flightNumber greșit în argument ${s.argWrong} · cod străin în răspuns ${s.foreignCode} · unealtă eșuată ${s.providerFailed} · mediană ${(s.medianMs / 1000).toFixed(1)} s`);
  }
  mkdirSync(new URL('../eval/results/', import.meta.url), { recursive: true });
  const file = new URL(`../eval/results/rotation-${new Date().toISOString().replace(/[:.]/g, '-')}.json`, import.meta.url);
  writeFileSync(file, JSON.stringify({ flights, summary, rows }, null, 1));
  console.log(`salvat: ${file.pathname.split('/').slice(-2).join('/')}`);
}
main().catch((e) => { console.error(String(e)); process.exit(1); });
