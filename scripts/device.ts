/**
 * Drive the phone app from the laptop, through the gateway (see server/gateway/deviceHub.ts).
 *   GATEWAY_TOKEN=... npx tsx scripts/device.ts status
 *   npx tsx scripts/device.ts add KL1375 | demo | load | reset
 *   npx tsx scripts/device.ts sampling --temp 0.2 --penalty 0 [--prompt raw|jinja]   |   reload --adapter on|off [--nctx 4096]
 *   npx tsx scripts/device.ts source deviceTools [live|mock]        (assistant: mock | laptop | device | deviceTools; tracker optional)
 *   npx tsx scripts/device.ts ask "când aterizez?" [--source deviceTools] [--lang en]
 *   npx tsx scripts/device.ts bench [--n 100] [--seed 7] [--source deviceTools]
 * The app must be open (Test mode screen has the token) with "Legătură cu laptopul" on. Env: GATEWAY_URL (default http://127.0.0.1:18090), GATEWAY_TOKEN.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { generateBench } from '../src/bench/questions';

const base = process.env.GATEWAY_URL ?? 'http://127.0.0.1:18090';
const token = process.env.GATEWAY_TOKEN ?? '';
const args = process.argv.slice(2);
const flag = (n: string, d?: string) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? args[i + 1] : d;
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function api(path: string, body?: unknown): Promise<any> {
  const res = await fetch(base + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${path} -> ${res.status} ${JSON.stringify(j)}`);
  return j;
}

async function send(type: string, payload: Record<string, unknown> = {}) {
  const st = await api('/v1/device/status');
  if (!st.connected) throw new Error('telefonul nu e conectat (aplicația deschisă, Mod test, token pus, „Legătura cu laptopul” pornită?)');
  return (await api('/v1/device/cmd', { type, ...payload })).id as string;
}

/** Waits for the command to finish, handing out progress items as they arrive. */
async function wait(id: string, onItem?: (item: any) => void, timeoutMs = 120 * 60_000) {
  let from = 0;
  const t0 = Date.now();
  for (;;) {
    const r = await api(`/v1/device/result/${id}?from=${from}`);
    for (const it of r.items) onItem?.(it);
    from = r.total;
    if (r.done) {
      if (r.error) throw new Error(`telefonul a răspuns cu eroare: ${r.error}`);
      return r.data;
    }
    if (Date.now() - t0 > timeoutMs) throw new Error('timeout');
    await sleep(1500);
  }
}

const med = (a: number[]) => (a.length ? [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)] : null);
const fmt = (n: number | null, d = 1) => (n === null ? '–' : n.toFixed(d));

async function main() {
  const [cmd, ...rest] = args;
  if (cmd === 'status') return console.log(JSON.stringify(await api('/v1/device/status'), null, 1));
  if (cmd === 'ping') return console.log(JSON.stringify(await wait(await send('ping')), null, 1));
  if (cmd === 'add') return console.log(JSON.stringify(await wait(await send('addFlight', { number: rest[0] })), null, 1));
  if (cmd === 'demo') return console.log(JSON.stringify(await wait(await send('addDemo')), null, 1));
  if (cmd === 'load') return console.log(JSON.stringify(await wait(await send('loadModel')), null, 1));
  if (cmd === 'reset') return console.log(JSON.stringify(await wait(await send('reset')), null, 1));
  if (cmd === 'sampling') {
    // sampling --temp 0.2 --penalty 0 [--topP 0.8] [--topK 20] [--prompt raw|jinja]
    const num = (n: string) => (flag(n) === undefined ? undefined : Number(flag(n)));
    return console.log(JSON.stringify(await wait(await send('setSampling', { temperature: num('temp'), penaltyPresent: num('penalty'), topP: num('topP'), topK: num('topK'), promptMode: flag('prompt') })), null, 1));
  }
  if (cmd === 'reload') {
    // reload --adapter on|off [--nctx 4096]
    const a = flag('adapter');
    return console.log(JSON.stringify(await wait(await send('reload', { adapter: a === undefined ? undefined : a === 'on', nCtx: flag('nctx') === undefined ? undefined : Number(flag('nctx')), kv: flag('kv') })), null, 1));
  }
  if (cmd === 'backend') {
    // backend gateway|flyq  (the FlyQ app key is read from the FLYQ_KEY environment variable, never from the command line or a file)
    return console.log(JSON.stringify(await wait(await send('setBackend', { backend: args[1], ...(process.env.FLYQ_KEY ? { key: process.env.FLYQ_KEY } : {}) })), null, 1));
  }
  if (cmd === 'contract') {
    // contract v3|v4   (which prompt the phone's tool mode sends; v4 needs the V4 adapter)
    return console.log(JSON.stringify(await wait(await send('setContract', { contract: args[1] })), null, 1));
  }
  if (cmd === 'source') return console.log(JSON.stringify(await wait(await send('setSource', { assistant: rest[0], tracker: rest[1] })), null, 1));
  if (cmd === 'ask') {
    const r = await wait(await send('ask', { question: rest[0], source: flag('source'), lang: flag('lang', 'ro') }));
    console.log(`[${r.mode} · ${r.path ?? r.via} · ${(r.ms / 1000).toFixed(1)} s · ${fmt(r.tokensPerSecond)} tok/s · unelte: ${r.tools.join(',') || 'niciuna'}]\n${r.answer}`);
    return;
  }
  if (cmd === 'bench') {
    const n = Number(flag('n', '100'));
    const seed = Number(flag('seed', String(Date.now() % 1_000_000)));
    const source = flag('source');
    const qs = generateBench(n, seed);
    console.log(`benchmark: ${qs.length} întrebări, seed ${seed}${source ? `, sursa ${source}` : ''}`);
    const items: any[] = [];
    const id = await send('bench', { questions: qs, source });
    await wait(id, (it) => {
      items.push(it);
      console.log(`${String(items.length).padStart(3)}/${qs.length} ${String(it.cat).padEnd(9)} ${(it.ms / 1000).toFixed(1).padStart(5)}s ${it.toolOk === null ? ' ' : it.toolOk ? 'ok' : 'NU'} [${it.path ?? it.via}; ${it.tools.join(',') || 'fără unelte'}] ${it.q}`);
    });
    const scored = items.filter((i) => i.toolOk !== null);
    const summary = {
      n: items.length,
      source: items[0]?.source,
      adapter: items[0]?.adapter,
      medianMs: med(items.map((i) => i.ms)),
      medianTokensPerSecond: med(items.filter((i) => i.tokensPerSecond).map((i) => i.tokensPerSecond)),
      medianTtftMs: med(items.filter((i) => i.ttftMs).map((i) => i.ttftMs)),
      pathCounts: Object.fromEntries(['fast', 'composed', 'model'].map(path => [path, items.filter(i => i.path === path).length])),
      medianToolMs: med(items.map(i => i.timing?.toolMs).filter((v): v is number => typeof v === 'number')),
      medianModelCallMs: med(items.flatMap(i => i.timing?.modelMs?.map((m: { totalMs: number }) => m.totalMs) ?? [])),
      modelAnswers: items.filter((i) => i.modelUsed).length,
      templateAnswers: items.filter((i) => i.via === 'template').length,
      toolChoice: scored.length ? { ok: scored.filter((i) => i.toolOk).length, of: scored.length } : null,
      byCategory: Object.fromEntries(
        [...new Set(items.map((i) => i.cat))].map((c) => {
          const g = items.filter((i) => i.cat === c && i.toolOk !== null);
          return [c, g.length ? `${g.filter((i) => i.toolOk).length}/${g.length}` : 'nescorat'];
        }),
      ),
    };
    mkdirSync(new URL('../eval/results/', import.meta.url), { recursive: true });
    const file = new URL(`../eval/results/phone-bench-${new Date().toISOString().replace(/[:.]/g, '-')}.json`, import.meta.url);
    writeFileSync(file, JSON.stringify({ seed, summary, items }, null, 1));
    console.log('\n=== rezumat ===');
    console.log(JSON.stringify(summary, null, 1));
    console.log(`salvat: ${file.pathname.split('/').slice(-3).join('/')}`);
    return;
  }
  console.log('comenzi: status | ping | add <zbor> | demo | load | reset | source <asistent> [tracker] | ask "<întrebare>" | bench [--n 100] [--seed N] [--source S]');
}

main().catch((e) => {
  console.error(String(e instanceof Error ? e.message : e));
  process.exit(1);
});
