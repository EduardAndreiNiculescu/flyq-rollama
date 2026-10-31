import type { BenchQ } from '../../bench/questions';
import { askMeasured, runBenchmark } from '../../bench/runner';
import { resetAssistants } from '../index';
import { useLive, type AssistantSource, type TrackerSource } from '../../store/live';
import { useTickets } from '../../store/tickets';
import { addDemoFlight, addLiveFlight } from './addLive';
import { adapterLoaded, deviceModelState, deviceOpts, engine, loadDeviceModel, reloadDevice } from './DeviceAssistantService';
import { gatewayCall } from './gatewayClient';

// The phone side of the remote control (server/gateway/deviceHub.ts): it long-polls the laptop for commands and answers them.
// The phone only makes outbound requests. It works while the app is open (iOS suspends it in the background).

type Cmd = { id: string; type: string; [k: string]: unknown };

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));
let started = false;
let modelState = '?';

function appStatus() {
  const { assistantSource, trackerSource } = useLive.getState();
  const { tickets, activeTicketId } = useTickets.getState();
  const t = tickets.find(x => x.id === activeTicketId);
  return { app: 'FlightFlow', backend: useLive.getState().backend, flyqKeySet: useLive.getState().flyqKey.length > 0, assistantSource, trackerSource, adapter: adapterLoaded(), model: modelState, nCtx: engine.nCtx, kv: deviceOpts.kv, contract: deviceOpts.contract, recoveries: engine.recoveries, trims: engine.trims, sampling: engine.sampling, promptMode: engine.promptMode, flight: t ? `${t.pass.carrier}${t.pass.flightNumber}` : null };
}

const report = (cmdId: string, body: Record<string, unknown>) => gatewayCall('/v1/device/result', { method: 'POST', body: JSON.stringify({ cmdId, ...body }) }, 15_000);

async function handle(cmd: Cmd) {
  const live = useLive.getState();
  try {
    switch (cmd.type) {
      case 'ping':
        modelState = await deviceModelState();
        return await report(cmd.id, { done: true, data: appStatus() });
      case 'loadModel': {
        const ok = await loadDeviceModel();
        modelState = await deviceModelState();
        return await report(cmd.id, { done: true, data: { loaded: ok, ...appStatus() } });
      }
      case 'setSampling': {
        const n = (k: string) => (typeof cmd[k] === 'number' ? (cmd[k] as number) : undefined);
        engine.sampling = { temperature: n('temperature') ?? engine.sampling.temperature, topP: n('topP') ?? engine.sampling.topP, topK: n('topK') ?? engine.sampling.topK, penaltyPresent: n('penaltyPresent') ?? engine.sampling.penaltyPresent };
        if (cmd.promptMode === 'raw' || cmd.promptMode === 'jinja') engine.promptMode = cmd.promptMode;
        resetAssistants();
        return await report(cmd.id, { done: true, data: appStatus() });
      }
      case 'reload': {
        const ok = await reloadDevice({ adapter: typeof cmd.adapter === 'boolean' ? cmd.adapter : undefined, nCtx: typeof cmd.nCtx === 'number' ? cmd.nCtx : undefined, kv: cmd.kv === 'q8_0' || cmd.kv === 'f16' ? cmd.kv : undefined });
        modelState = await deviceModelState();
        return await report(cmd.id, { done: true, data: { loaded: ok, ...appStatus() } });
      }
      case 'setBackend': {
        const s = useLive.getState();
        if (cmd.backend === 'gateway' || cmd.backend === 'flyq') s.setBackend(cmd.backend);
        if (typeof cmd.key === 'string' && cmd.key) s.setFlyqKey(cmd.key);
        return await report(cmd.id, { done: true, data: appStatus() });
      }
      case 'setContract':
        if (cmd.contract === 'v3' || cmd.contract === 'v4') deviceOpts.contract = cmd.contract;
        resetAssistants();
        return await report(cmd.id, { done: true, data: appStatus() });
      case 'addFlight': {
        const r = await addLiveFlight(String(cmd.number ?? ''));
        return await report(cmd.id, { done: true, data: r });
      }
      case 'addDemo':
        return await report(cmd.id, { done: true, data: addDemoFlight() });
      case 'setSource':
        if (typeof cmd.assistant === 'string') live.setAssistantSource(cmd.assistant as AssistantSource);
        if (typeof cmd.tracker === 'string') live.setTrackerSource(cmd.tracker as TrackerSource);
        return await report(cmd.id, { done: true, data: appStatus() });
      case 'reset':
        resetAssistants();
        return await report(cmd.id, { done: true, data: appStatus() });
      case 'ask': {
        const prev = live.assistantSource;
        if (typeof cmd.source === 'string') live.setAssistantSource(cmd.source as AssistantSource);
        try {
          const r = await askMeasured({ q: String(cmd.question ?? ''), lang: cmd.lang === 'en' ? 'en' : 'ro' });
          return await report(cmd.id, { done: true, data: r });
        } finally {
          useLive.getState().setAssistantSource(prev);
        }
      }
      case 'bench': {
        const qs = (Array.isArray(cmd.questions) ? cmd.questions : []) as BenchQ[];
        await runBenchmark(qs, { source: typeof cmd.source === 'string' ? (cmd.source as AssistantSource) : undefined, onItem: async r => { await report(cmd.id, { item: r }); } });
        return await report(cmd.id, { done: true, data: { n: qs.length } });
      }
      default:
        return await report(cmd.id, { error: `unknown command ${cmd.type}` });
    }
  } catch (e) {
    await report(cmd.id, { error: e instanceof Error ? e.message : String(e) }).catch(() => {});
  }
}

export function startDeviceLink() {
  if (started) return;
  started = true;
  void (async () => {
    for (;;) {
      if (!useLive.getState().linkEnabled || !useLive.getState().token) {
        await sleep(4000);
        continue;
      }
      try {
        const r = (await gatewayCall(`/v1/device/poll?info=${encodeURIComponent(JSON.stringify(appStatus()))}`, {}, 35_000)) as { cmd?: Cmd | null };
        if (r.cmd) await handle(r.cmd);
      } catch {
        await sleep(4000);
      }
    }
  })();
}
