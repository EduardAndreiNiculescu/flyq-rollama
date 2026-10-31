import { create } from 'zustand';
import type { FlightRecord } from '../core/types';

/**
 * What the FlyQ server last said about the active flight (gate, estimates, delay), kept apart from the static schedule the UI was built with.
 * `flightData.getFlight` merges it, and `version` lets screens re-render when it changes (they read flights imperatively, not through a store).
 */
export type FlightOverlay = {
  gate: string | null;
  gateStatus: 'unconfirmed' | 'confirmed';
  estimatedDeparture: string | null;
  estimatedArrival: string | null;
  departureDelayMin: number | null;
  arrivalDelayMin: number | null;
  providerStatus: FlightRecord['providerStatus'] | null;
  receivedAt: number;
};

export type FlightChange = { id: number; flightId: string; kind: 'gate' | 'delay'; from: string | null; to: string | null; at: number };

type State = {
  overlays: Record<string, FlightOverlay>;
  /** Bumped on every update: subscribe to it to re-render after a sync. */
  version: number;
  lastSyncAt: number | null;
  lastError: string | null;
  lastChange: FlightChange | null;
  apply: (flightId: string, overlay: FlightOverlay, previousGate: string | null) => void;
  setSyncResult: (error: string | null) => void;
  reset: () => void;
};

let changeId = 0;

export const useFlightStatus = create<State>(set => ({
  overlays: {},
  version: 0,
  lastSyncAt: null,
  lastError: null,
  lastChange: null,
  apply: (flightId, overlay, previousGate) =>
    set(s => {
      const old = s.overlays[flightId];
      let lastChange = s.lastChange;
      if (overlay.gate && overlay.gateStatus === 'confirmed' && previousGate !== overlay.gate) {
        lastChange = { id: ++changeId, flightId, kind: 'gate', from: previousGate, to: overlay.gate, at: overlay.receivedAt };
      } else if ((overlay.departureDelayMin ?? 0) !== (old?.departureDelayMin ?? 0) && overlay.departureDelayMin !== null) {
        lastChange = { id: ++changeId, flightId, kind: 'delay', from: String(old?.departureDelayMin ?? 0), to: String(overlay.departureDelayMin), at: overlay.receivedAt };
      }
      return { overlays: { ...s.overlays, [flightId]: overlay }, version: s.version + 1, lastSyncAt: overlay.receivedAt, lastError: null, lastChange };
    }),
  setSyncResult: error => set(s => ({ lastError: error, lastSyncAt: error ? s.lastSyncAt : Date.now() })),
  reset: () => set({ overlays: {}, version: 0, lastSyncAt: null, lastError: null, lastChange: null }),
}));

/** Call at the top of a screen that shows flight facts: it re-renders when the server's state changes. */
export const useFlightStatusVersion = () => useFlightStatus(s => s.version);
