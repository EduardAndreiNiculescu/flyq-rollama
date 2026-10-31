// Reads the Response Composer against the benchmark's own flight questions (noisy variants included) and several flight situations.
//   npx tsx scripts/composer-review.ts [--show]      prints coverage per category; --show prints every sentence for reading.
import { BASE, generateBench } from '../src/bench/questions';
import { composeAnswer } from '../src/tools/composer';
import { createTools, executeToolCall } from '../src/tools/registry';
import type { FlightRecord } from '../src/core/types';
import { unsupportedFacts } from './composer-facts';

const show = process.argv.includes('--show');
const base: FlightRecord = { flightNumber: 'RO311', departureAirport: 'CRA', arrivalAirport: 'BGY', scheduledDeparture: '2026-10-31T12:45:00+02:00', scheduledArrival: '2026-10-31T14:10:00+01:00', gate: null, gateStatus: 'unconfirmed', dataSource: 'airlabs', lastUpdated: '2026-10-31T09:00:00Z' };
const FLIGHTS: Record<string, { f: FlightRecord; now: string }> = {
  'inainte de plecare, fara estimare': { f: base, now: '2026-10-31T09:00:00+02:00' },
  'intarziat 25 min, poarta confirmata': { f: { ...base, gate: 'B4', gateStatus: 'confirmed', estimatedDeparture: '2026-10-31T13:10:00+02:00', estimatedArrival: '2026-10-31T14:35:00+01:00', providerStatus: 'scheduled' }, now: '2026-10-31T09:00:00+02:00' },
  'in zbor, devreme': { f: { ...base, estimatedArrival: '2026-10-31T14:00:00+01:00', providerStatus: 'en-route' }, now: '2026-10-31T13:00:00+02:00' },
  'aterizat': { f: { ...base, providerStatus: 'landed' }, now: '2026-10-31T16:00:00+01:00' },
  'anulat': { f: { ...base, providerStatus: 'cancelled' as never }, now: '2026-10-31T09:00:00+02:00' },
  'zbor maine': { f: base, now: '2026-10-30T20:00:00+02:00' },
};
const tools = createTools();
const flightCats = new Set(['arrival', 'departure', 'delay', 'duration', 'gate', 'remaining']);
const qs = [...BASE.filter((b) => flightCats.has(b.cat)).map((b) => ({ q: b.q, cat: b.cat, expect: b.expect })), ...generateBench(400, 7).filter((x) => flightCats.has(x.cat)).map((x) => ({ q: x.q, cat: x.cat, expect: x.expect }))];

import { guardToolAnswer } from '../src/tools/guardAnswer';
let guardHits = 0;
const stat: Record<string, { n: number; composed: number; eligible: number; eligibleComposed: number }> = {};
let unsupported = 0;
async function main() {
for (const [label, { f, now }] of Object.entries(FLIGHTS)) {
  if (show) console.log(`\n=== ${label} ===`);
  for (const x of qs) {
    const tool = x.expect[0] === '*' ? 'get_flight_details' : x.expect[0];
    const r = await executeToolCall(tools, tool, {}, { now: () => new Date(now), context: { flightNumber: f.flightNumber } as never, flights: [f] });
    const text = composeAnswer(x.q, [{ name: tool, ok: r.ok, data: r.ok ? r.data : null }], new Date(now));
    const s = (stat[x.cat] ??= { n: 0, composed: 0, eligible: 0, eligibleComposed: 0 });
    s.n++;
    if (label !== 'anulat') s.eligible++;
    if (text) {
      s.composed++;
      if (label !== 'anulat') s.eligibleComposed++;
      const missing = unsupportedFacts(text, r.ok ? r.data : null);
      if (missing.length) { unsupported++; console.error(`UNSUPPORTED ${JSON.stringify(missing)} <- ${text}`); }
      const msgs = [{ role: 'user', content: x.q }, { role: 'tool', content: JSON.stringify({ result: r.ok ? r.data : null }) }] as never;
      const v = guardToolAnswer(msgs, text, x.q, [f.flightNumber]).violations;
      if (v.length) { guardHits++; console.log(`GUARD ${JSON.stringify(v)} <- ${text}`); }
    }
    if (show) console.log(`[${x.cat}/${tool.replace('get_', '')}] ${x.q}\n   -> ${text ?? '(model)'}`);
  }
}
console.log('\nacoperire (compus fără model) pe categorie, toate situațiile:');
for (const [c, s] of Object.entries(stat)) console.log(`  ${c.padEnd(10)} ${s.composed}/${s.n}  ${Math.round((100 * s.composed) / s.n)}%`);
console.log('acoperire pe situațiile eligibile (fără zborul anulat):');
for (const [c, s] of Object.entries(stat)) console.log(`  ${c.padEnd(10)} ${s.eligibleComposed}/${s.eligible}  ${Math.round((100 * s.eligibleComposed) / s.eligible)}%`);
console.log(`propoziții compuse respinse de gardă: ${guardHits}`);
console.log(`răspunsuri cu cifre, ore sau coduri fără suport în rezultatul uneltei: ${unsupported}`);
if (unsupported) process.exitCode = 1;
}
void main();
