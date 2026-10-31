import { create } from 'zustand';
import { flightTracker } from '../services';
import type { Flight, FlightPosition } from '../types';

export type FlightPhase = 'ground' | 'inAir' | 'landed';

// Starea modului avion nu se salvează: la repornirea aplicației începi din nou de la sol.
// Abonarea la tracker trăiește aici, ca zborul să continue când schimbi tab-ul.
interface FlightModeState {
  phase: FlightPhase;
  position: FlightPosition | null;
  takeOff: (flight: Flight) => void;
  backToGround: () => void;
}

let unsubscribe: (() => void) | null = null;
// Tracker-ul emite de 2 ori pe secundă, dar cifrele, bara și harta nu au nevoie de atât:
// UI-ul primește poziția cel mult o dată pe secundă (imediat la prima poziție, la schimbarea sursei și la aterizare).
const UI_EVERY_MS = 1000;
let lastUiAt = 0;
let lastSource: FlightPosition['source'] | null = null;

export const useFlightMode = create<FlightModeState>(set => ({
  phase: 'ground',
  position: null,
  takeOff: flight => {
    unsubscribe?.();
    lastUiAt = 0;
    lastSource = null;
    unsubscribe = flightTracker.subscribe(position => {
      const now = Date.now();
      const landed = position.progress >= 1;
      if (landed || lastSource !== position.source || now - lastUiAt >= UI_EVERY_MS) {
        lastUiAt = now;
        lastSource = position.source;
        set({ position });
      }
      if (landed) {
        unsubscribe?.();
        unsubscribe = null;
        set({ phase: 'landed' });
      }
    });
    set({ phase: 'inAir', position: null });
    flightTracker.start(flight);
  },
  backToGround: () => {
    flightTracker.stop();
    unsubscribe?.();
    unsubscribe = null;
    set({ phase: 'ground', position: null });
  },
}));
