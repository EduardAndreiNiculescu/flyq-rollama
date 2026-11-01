// Singurul loc unde se aleg implementările serviciilor. UI-ul importă doar de aici
// și folosește interfețele din ./types. Modul test (ecranul „Mod test”) alege la fiecare apel între mock,
// laptop (gateway) și telefon, fără să repornești aplicația.
import { openMapFor } from '../app/navRef';
import { applyServerState } from '../lib/serverState';
import { formatLocalTime } from '../lib/time';
import { Mutex } from '../bench/lock';
import { urgentSafetyAnswer } from '../core/emergency';
import { useProgress } from '../store/assistantUi';
import { useAnswerStats } from '../store/stats';
import { useFlightMode } from '../store/flightMode';
import { useFlightStatus } from '../store/flightStatus';
import { useLive } from '../store/live';
import { useTickets } from '../store/tickets';
import type { Airport, BoardingPass, Flight, FlightContext, FlightPosition, Landmark } from '../types';
import { CameraBarcodeScannerService } from './camera/CameraBarcodeScannerService';
import { DeviceAssistantService, DeviceToolsAssistantService, engine } from './live/DeviceAssistantService';
import { GatewayAssistantService } from './live/GatewayAssistantService';
import { LiveFlightTrackerService } from './live/LiveFlightTrackerService';
import { getLiveAirport, getLiveEntry, isLiveFlightId } from './live/liveFlights';
import { MockAssistantService } from './mock/MockAssistantService';
import { MockClockService } from './mock/MockClockService';
import { MockFlightDataService } from './mock/MockFlightDataService';
import { MockFlightTrackerService } from './mock/MockFlightTrackerService';
import { MockIndoorPositionService } from './mock/MockIndoorPositionService';
import { MockTerminalService } from './mock/MockTerminalService';
import type {
  AssistantService,
  BarcodeScannerService,
  ClockService,
  FlightDataService,
  FlightTrackerService,
  IndoorPositionService,
  TerminalService,
  Unsubscribe,
} from './types';

const mockClock = new MockClockService();
const activeFlightIsLive = () => {
  const { tickets, activeTicketId } = useTickets.getState();
  const t = tickets.find(x => x.id === activeTicketId);
  return !!t && isLiveFlightId(t.flightId);
};

// A real flight lives in real time; the demo flight lives in the demo clock.
export const clock: ClockService = {
  now: () => (activeFlightIsLive() ? new Date() : mockClock.now()),
  advance: m => mockClock.advance(m),
  reset: () => mockClock.reset(),
};

const mockData = new MockFlightDataService();
const mergedCache = new Map<string, { base: Flight; o: unknown; e: unknown; result: Flight }>();
export const flightData: FlightDataService = {
  findFlight: (pass: BoardingPass, now: Date): Flight | null => mockData.findFlight(pass, now),
  // The flight with what the FlyQ server last said merged in (gate, delay, estimated times, status, ETA). Cached by the identity of its inputs, so the same
  // object comes back until something changes: screens that keep it in a useMemo/useEffect dependency do not loop.
  getFlight: (id: string) => {
    const base = getLiveEntry(id)?.flight ?? mockData.getFlight(id);
    if (!base) return base;
    const st = useFlightStatus.getState();
    const o = st.overlays[id];
    const e = st.etas[id];
    const hit = mergedCache.get(id);
    if (hit && hit.base === base && hit.o === o && hit.e === e) return hit.result;
    const result = applyServerState(base, o ? { gate: o.gate, gateStatus: o.gateStatus, estimatedDeparture: o.estimatedDeparture, estimatedArrival: o.estimatedArrival, departureDelayMin: o.departureDelayMin, arrivalDelayMin: o.arrivalDelayMin, status: o.status, belt: o.belt } : undefined, e ? { arrivalEpoch: e.arrivalEpoch, source: e.source } : undefined);
    mergedCache.set(id, { base, o, e, result });
    return result;
  },
  getAirport: (code: string): Airport | null => getLiveAirport(code) ?? mockData.getAirport(code),
  getLandmarks: (): Landmark[] => mockData.getLandmarks(),
};

export const terminalService: TerminalService = new MockTerminalService();
// Camera reală; ecranul de scanare îi dă codurile prin `cameraScanner.handleBarcode`.
export const cameraScanner = new CameraBarcodeScannerService();
export const barcodeScanner: BarcodeScannerService = cameraScanner;
export const indoorPosition: IndoorPositionService = new MockIndoorPositionService();

// Tracker: picks mock or live when a flight starts; subscribers survive a switch.
const mockTracker = new MockFlightTrackerService();
const liveTracker = new LiveFlightTrackerService();
const trackerListeners = new Set<(p: FlightPosition) => void>();
let trackerOff: Unsubscribe[] = [];
const emit = (p: FlightPosition) => trackerListeners.forEach(cb => cb(p));
export const flightTracker: FlightTrackerService = {
  start(flight) {
    this.stop();
    const live = useLive.getState().trackerSource === 'live' && isLiveFlightId(flight.id);
    const impl = live ? liveTracker : mockTracker;
    trackerOff = [impl.subscribe(emit)];
    impl.start(flight);
  },
  stop() {
    mockTracker.stop();
    liveTracker.stop();
    trackerOff.forEach(off => off());
    trackerOff = [];
  },
  subscribe(cb) {
    trackerListeners.add(cb);
    return () => trackerListeners.delete(cb);
  },
  debug: { setSource: s => (useLive.getState().trackerSource === 'live' ? liveTracker : mockTracker).debug?.setSource(s) },
};

// Assistant: mock answers, the laptop model (gateway), or the on-device Qwen3-4B.
const mockAssistant = new MockAssistantService();
const laptopAssistant = new GatewayAssistantService();
const deviceDeps = {
  now: () => clock.now(),
  phase: () => useFlightMode.getState().phase,
  openMap: ({ destination, nodeId }: { destination: string; nodeId?: string }) => openMapFor(destination, nodeId),
  localTime: (utcIso: string, code: string) => {
    const a = flightData.getAirport(code);
    return a ? formatLocalTime(utcIso, a.utcOffsetMin) : null;
  },
};
const deviceAssistant = new DeviceAssistantService(deviceDeps);
const deviceToolsAssistant = new DeviceToolsAssistantService(deviceDeps);
const assistantLock = new Mutex();
export const assistant: AssistantService = {
  ask(question: string, context: FlightContext) {
    const s = useLive.getState().assistantSource;
    const impl = s === 'laptop' ? laptopAssistant : s === 'device' ? deviceAssistant : s === 'deviceTools' ? deviceToolsAssistant : mockAssistant;
    return (async function* () {
      const emergency = urgentSafetyAnswer(question, context.language);
      if (emergency) {
        useProgress.setState({ active: false, tools: [] });
        useAnswerStats.getState().set({ mode: 'Siguranță', via: 'safety', modelUsed: false, ttftMs: null, tokensPerSecond: null, tokens: 0, totalMs: 0, tools: [], adapter: false });
        yield emergency;
        return;
      }
      const release = await assistantLock.acquire(); // chat, remote commands and the benchmark take turns
      try {
        yield* impl.ask(question, context);
      } finally {
        release();
      }
    })();
  },
  async warmUp(context: FlightContext) {
    if (useLive.getState().assistantSource !== 'deviceTools') return;
    const release = await assistantLock.acquire();
    try {
      await deviceToolsAssistant.warmUp(context);
    } finally {
      release();
    }
  },
  async stop() {
    const s = useLive.getState().assistantSource;
    if (s === 'deviceTools') await deviceToolsAssistant.stop();
    else if (s === 'device') await engine.stop();
  },
};
export const resetAssistants = () => {
  deviceAssistant.reset();
  deviceToolsAssistant.reset();
};

export type * from './types';
