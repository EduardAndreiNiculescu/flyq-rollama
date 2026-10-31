import type {
  Airport,
  BoardingPass,
  Flight,
  FlightContext,
  FlightPosition,
  IndoorPosition,
  Landmark,
  Poi,
  Route,
  Terminal,
} from '../types';

// Interfețele pe care le folosește UI-ul. Fiecare are acum o implementare mock;
// implementarea reală se alege într-un singur loc: src/services/index.ts.

export type Unsubscribe = () => void;

export interface ClockService {
  /** Ora curentă; mock-ul o ancorează în ziua zborului demo */
  now(): Date;
  /** Doar pentru demo: mută ceasul înainte, ca să vezi stările „sub 30 min” etc. */
  advance(minutes: number): void;
  reset(): void;
}

export interface FlightDataService {
  findFlight(pass: BoardingPass, now: Date): Flight | null;
  getFlight(id: string): Flight | null;
  getAirport(code: string): Airport | null;
  getLandmarks(): Landmark[];
}

export interface TerminalService {
  getTerminal(): Terminal;
  getPois(): Poi[];
}

export interface BarcodeScannerService {
  /** Pornește camera și rezolvă cu textul codului citit (PDF417 / Aztec / QR) */
  scan(): Promise<string>;
  cancel(): void;
}

export interface IndoorPositionService {
  start(route: Route): void;
  stop(): void;
  subscribe(cb: (position: IndoorPosition) => void): Unsubscribe;
  /** Opțional, doar pentru demo și debug */
  debug?: {
    simulateDeviation(): void;
    setSpeedMultiplier(multiplier: number): void;
  };
}

export interface FlightTrackerService {
  start(flight: Flight): void;
  stop(): void;
  subscribe(cb: (position: FlightPosition) => void): Unsubscribe;
  debug?: {
    setSource(source: 'gps' | 'estimate'): void;
  };
}

export interface AssistantService {
  /** Întoarce răspunsul ca stream de text (token cu token). Rulează local, fără internet. */
  ask(question: string, context: FlightContext): AsyncIterable<string>;
  /** Opțional: pregătește modelul înainte de prima întrebare (încărcare, compilarea shaderelor). */
  warmUp?(context: FlightContext): Promise<void>;
  /** Opțional: oprește răspunsul care se generează acum. */
  stop?(): Promise<void>;
}
