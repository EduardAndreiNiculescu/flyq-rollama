/**
 * Test gateway: lets the (desktop) model call the app's tools against LIVE data.
 * Not part of the shipped app. The tool contract (names, descriptions, argument schemas) is the app's own:
 *   GET  /v1/tools            -> the exact specs the app/model sees
 *   POST /v1/tools/{name}     -> {"arguments": {...}, "flightNumber"?: "..."}  runs one tool with live data
 *   POST /v1/chat             -> {"question": "...", "flightNumber"?: "..."}  runs the model + tool loop end to end
 *   GET  /health
 * Security: bind to 127.0.0.1 only, reject browser origins, JSON only, small bodies, no secrets in logs.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import type { LlmEngine } from '../../src/core/assistant';
import { urgentSafetyAnswer } from '../../src/core/emergency';
import { toolPrompt, type Contract } from '../../src/llm/contract';
import { airportPoint } from '../../src/core/airports';
import { routeDecision, routeIntents } from '../../src/core/router';
import { guardToolAnswer } from '../../src/tools/guardAnswer';
import { runToolLoop } from '../../src/tools/loop';
import { createTools, executeToolCall, toolSpecs, type ToolDeps } from '../../src/tools/registry';
import { liveTools } from './liveTools';
import { DeviceHub } from './deviceHub';
import { UI_HTML } from './ui';
import type { LiveProvider } from './providers';

import { TOOL_MODE_NOTE } from '../../src/tools/toolMode';
export { TOOL_MODE_NOTE };

const MAX_BODY = 16 * 1024;

export type GatewayDeps = {
  provider: LiveProvider;
  /** When set, every request except GET /health must carry `Authorization: Bearer <token>`. Required when listening beyond loopback. */
  token?: string;
  engine: LlmEngine | null;
  modelInfo?: () => Promise<unknown>;
  dataMode?: 'demo' | 'live';
  nowMs?: () => number;
  log?: (line: string) => void;
  /** Log every question, tool call and answer (local debugging only; chat content is personal data). Off by default. */
  logChat?: boolean;
  /** Answer guard on chat answers (default on). Off = raw model text, for measuring the model itself. */
  guard?: boolean;
  /** Flight answers composed from the tool result instead of a second model call (default on; FF_COMPOSE=0 turns it off for A/B runs). */
  compose?: boolean;
  /** Enable the zero-model path for a strict set of flight questions (default off). */
  fastPath?: boolean;
  /** Remote control of the phone app (see deviceHub.ts). */
  hub?: DeviceHub;
  /** Which prompt the model gets: 'v3' (default, today's) or 'v4' (static compact contract). Set with FF_CONTRACT=v4. */
  contract?: Contract;
};

function send(res: http.ServerResponse, code: number, body: unknown) {
  const text = JSON.stringify(body);
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(text);
}

function readJson(req: http.IncomingMessage, max = MAX_BODY): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > max) {
        reject(Object.assign(new Error('body too large'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      try {
        const v = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
        if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('not an object');
        resolve(v as Record<string, unknown>);
      } catch {
        reject(Object.assign(new Error('invalid JSON body'), { status: 400 }));
      }
    });
    req.on('error', reject);
  });
}

export function createGateway(d: GatewayDeps): http.Server {
  const nowMs = d.nowMs ?? Date.now;
  const tools = liveTools(d.provider);
  const specs = toolSpecs(createTools()); // the public contract is the app's own, unchanged
  const log = d.log ?? (() => {});
  const hub = d.hub ?? new DeviceHub(nowMs);

  const baseDeps = (flightNumber?: string): ToolDeps => ({
    now: () => new Date(nowMs()),
    context: { flightNumber, connectionAvailable: true },
    tracking: (fn) => d.provider.tracking(fn),
    airportPoint,
  });

  return http.createServer(async (req, res) => {
    const t0 = Date.now();
    let status = 200;
    const reply = (code: number, body: unknown) => {
      status = code;
      send(res, code, body);
    };
    try {
      // Browsers send Origin on same-origin POSTs too: only the gateway's own page (/ui) may do that; any other origin is refused.
      if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) return reply(403, { error: 'browser origins are not allowed' });
      const url = new URL(req.url ?? '/', 'http://localhost');
      if (req.method === 'GET' && url.pathname === '/ui') { status = 200; res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }); return void res.end(UI_HTML); }
      if (d.token && !(req.method === 'GET' && url.pathname === '/health') && req.headers.authorization !== `Bearer ${d.token}`) return reply(401, { error: 'missing or wrong token' });

      if (req.method === 'GET' && url.pathname === '/health') return reply(200, { ok: true, dataMode: d.dataMode ?? 'live', upstream: d.provider.stats });
      if (req.method === 'GET' && url.pathname === '/v1/model') return reply(200, d.modelInfo ? await d.modelInfo() : { available: false });
      if (req.method === 'GET' && url.pathname === '/v1/tools') return reply(200, { tools: specs });

      // ---- remote control of the phone (token-protected like everything else) ----
      if (req.method === 'GET' && url.pathname === '/v1/device/status') return reply(200, hub.status());
      if (req.method === 'GET' && url.pathname === '/v1/device/poll') {
        let info: unknown;
        try {
          info = url.searchParams.get('info') ? JSON.parse(url.searchParams.get('info')!.slice(0, 2000)) : undefined;
        } catch {
          info = undefined;
        }
        const cmd = await hub.poll(info);
        return reply(200, { cmd });
      }
      const dr = req.method === 'GET' ? /^\/v1\/device\/result\/(c\d{1,6})$/.exec(url.pathname) : null;
      if (dr) {
        const r = hub.result(dr[1], Number(url.searchParams.get('from') ?? 0) || 0);
        return r ? reply(200, r) : reply(404, { error: 'unknown command' });
      }

      // One round trip for the app: the flight record (schedule, estimates, gate) and the live position, both from the provider.
      const fm = req.method === 'GET' ? /^\/v1\/flight\/([A-Za-z0-9]{2,3}\s?\d{1,4}[A-Za-z]?)$/.exec(decodeURIComponent(url.pathname)) : null;
      if (fm) {
        const lookup = await d.provider.lookup(fm[1]);
        if (!lookup.ok) return reply(lookup.reason === 'not_found' ? 404 : 502, { error: lookup.reason });
        const tracking = await d.provider.tracking(fm[1]);
        return reply(200, { record: lookup.record, tracking, upstream: d.provider.stats });
      }

      if (req.method === 'POST') {
        if (!String(req.headers['content-type'] ?? '').startsWith('application/json')) return reply(415, { error: 'send application/json' });
        const big = url.pathname.startsWith('/v1/device/') || url.pathname === '/v1/bench';
        const body = await readJson(req, big ? 256 * 1024 : MAX_BODY);
        if (url.pathname === '/v1/device/cmd') {
          if (typeof body.type !== 'string' || !/^[a-zA-Z]{1,24}$/.test(body.type)) return reply(400, { error: 'type must be a short word' });
          return reply(200, { id: hub.enqueue(body as { type: string }) });
        }
        if (url.pathname === '/v1/device/result') {
          const ok = typeof body.cmdId === 'string' && hub.report(body.cmdId, body as { item?: unknown; done?: boolean; data?: unknown; error?: string });
          return ok ? reply(200, { ok: true }) : reply(404, { error: 'unknown command' });
        }
        const flightNumber = typeof body.flightNumber === 'string' ? body.flightNumber.slice(0, 12) : undefined;

        // Benchmark results from the phone: stored as a file on the laptop (eval/results), nothing is interpreted.
        if (url.pathname === '/v1/bench') {
          if (!Array.isArray(body.items) || body.items.length > 200) return reply(400, { error: 'items must be an array (max 200)' });
          const dir = new URL('../../eval/results/', import.meta.url);
          mkdirSync(dir, { recursive: true });
          const file = new URL(`phone-bench-${new Date(nowMs()).toISOString().replace(/[:.]/g, '-')}.json`, dir);
          writeFileSync(file, JSON.stringify({ receivedAt: new Date(nowMs()).toISOString(), ...body }, null, 1));
          return reply(200, { saved: file.pathname.split('/').pop() });
        }

        const m = /^\/v1\/tools\/([a-z_]{1,40})$/.exec(url.pathname);
        if (m) {
          if (!tools.some((t) => t.name === m[1])) return reply(404, { error: `unknown tool "${m[1]}"` });
          const r = await executeToolCall(tools, m[1], body.arguments ?? {}, baseDeps(flightNumber));
          return reply(200, { ...r, upstream: d.provider.stats });
        }

        if (url.pathname === '/v1/chat') {
          const question = typeof body.question === 'string' ? body.question.trim() : '';
          if (!question || question.length > 500) return reply(400, { error: 'question must be 1-500 characters' });
          const emergency = urgentSafetyAnswer(question);
          if (emergency) return reply(200, { text: emergency, guard: [], trace: [], timing: { toolMs: 0, modelMs: [] }, stoppedByLimit: false, path: 'fast', ms: Date.now() - t0, upstream: d.provider.stats });
          // Never expose tool schemas to a prompt-injection fallback. The router
          // keeps this as `model` for backwards compatibility, so the gateway
          // must enforce the no-tool firewall before starting the model loop.
          const safetyRoute = routeDecision(question, { flightNumber });
          if (safetyRoute.evidence.includes('possible-injection')) {
            return reply(200, {
              text: 'Nu pot executa instrucțiuni care încearcă să schimbe regulile sau să apeleze unelte necerute.',
              guard: [], trace: [], timing: { toolMs: 0, modelMs: [] }, stoppedByLimit: false,
              path: 'fast', ms: Date.now() - t0, upstream: d.provider.stats,
            });
          }
          // No domain candidate means the model has no safe tool shortlist. Keep
          // it out of the tool loop; this prevents out-of-scope questions from
          // being turned into arbitrary airport actions.
          if (safetyRoute.candidates.length === 0) {
            return reply(200, {
              text: 'Pot ajuta doar cu zboruri, reguli pentru pasageri și orientare în aeroport.',
              guard: [], trace: [], timing: { toolMs: 0, modelMs: [] }, stoppedByLimit: false,
              path: 'fast', ms: Date.now() - t0, upstream: d.provider.stats,
            });
          }
          if (!d.engine) return reply(501, { error: 'no model engine configured' });
          const fn = flightNumber ?? routeIntents(question).find((i) => i.args.flightNumber)?.args.flightNumber;
          const deps = baseDeps(fn);
          const prompt = toolPrompt(d.contract ?? 'v3', { now: deps.now(), context: deps.context });
          const out = await runToolLoop(
            d.engine,
            [{ role: 'system', content: prompt.system }, { role: 'user', content: question }],
            deps,
            () => {},
            { tools, specs: prompt.specs, maxSteps: 3, maxTokens: 300, allowSideEffects: false, compose: d.compose !== false, fastPath: d.fastPath === true, intentRouting: true },
          );
          // A composed sentence is built from the tool result and worded with the caveats; the guard (made for free model text) would flag its "has landed / is delayed" as status claims.
          const guarded = d.guard === false || out.path !== 'model' ? { text: out.text, violations: [] as never[] } : guardToolAnswer(out.messages, out.text, question, fn ? [fn] : []);
          if (guarded.violations.length) log(`GUARD ${JSON.stringify({ q: question, rejected: out.text.slice(0, 160), violations: guarded.violations })}`);
          const rawText = out.text;
          out.text = guarded.text;
          if (d.logChat) log(`CHAT ${JSON.stringify({ flight: fn ?? null, q: question, tools: out.trace.map((t) => `${t.name}${t.ok ? '' : '!'} ${t.args}`), a: out.text, ms: Date.now() - t0 })}`);
          return reply(200, { text: out.text, guard: guarded.violations, trace: out.trace, timing: out.timing, stoppedByLimit: out.stoppedByLimit, path: out.path, ms: Date.now() - t0, upstream: d.provider.stats,
            ...(body.debug === true ? { debug: { contract: d.contract ?? 'v3', dataMode: d.dataMode ?? 'live', selectedFlight: fn ?? null, messages: out.messages, rawText, thinking: 'disabled', modelCalls: out.timing.modelMs.length } } : {}) });
        }
      }
      return reply(404, { error: 'not found' });
    } catch (e) {
      const code = (e as { status?: number }).status ?? 500;
      // Never echo internals: error messages from upstream clients are fixed strings, but stay conservative.
      return reply(code, { error: code === 500 ? 'internal error' : (e as Error).message });
    } finally {
      log(`${req.method} ${req.url?.split('?')[0]} -> ${status} ${Date.now() - t0}ms`);
    }
  });
}
