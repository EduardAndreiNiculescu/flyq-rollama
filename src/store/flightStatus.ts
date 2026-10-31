import { create } from 'zustand';
import type { FlightRecord } from '../core/types';
import type { ArrivalEstimate } from '../services/live/arrival';

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
  /** From the server's events (boarding, gate closing, cancelled, diverted, landed) or the provider status */
  status: string | null;
  belt: string | null;
  receivedAt: number;
};

export type FlightChange = { id: number; flightId: string; kind: 'gate' | 'delay' | 'status'; from: string | null; to: string | null; at: number };

type State = {
  overlays: Record<string, FlightOverlay>;
  /** The latest arrival estimate per flight (server ETA first, the app's own model as fallback), with when it was fetched. */
  etas: Record<string, (ArrivalEstimate & { fetchedAt: number }) | undefined>;
  /** Bumped on every update: subscribe to it to re-render after a sync. */
  version: number;
  lastSyncAt: number | null;
  lastError: string | null;
  lastChange: FlightChange | null;
  apply: (flightId: string, overlay: FlightOverlay, previousGate: string | null) => void;
  setEta: (flightId: string, eta: ArrivalEstimate | null) => void;
  setSyncResult: (error: string | null) => void;
  reset: () => void;
};

let changeId = 0;

export const useFlightStatus = create<State>(set => ({
  overlays: {},
  etas: {},
  version: 0,
  lastSyncAt: null,
  lastError: null,
  lastChange: null,
  setEta: (flightId, eta) => set(s => ({ etas: { ...s.etas, [flightId]: eta ? { ...eta, fetchedAt: Date.now() } : undefined }, version: s.version + 1 })),
  apply: (flightId, overlay, previousGate) =>
    set(s => {
      const old = s.overlays[flightId];
      let lastChange = s.lastChange;
      if (overlay.gate && overlay.gateStatus === 'confirmed' && previousGate !== overlay.gate) {
        lastChange = { id: ++changeId, flightId, kind: 'gate', from: previousGate, to: overlay.gate, at: overlay.receivedAt };
      } else if (overlay.status && overlay.status !== old?.status && ['cancelled', 'diverted', 'landed', 'boarding', 'gate_closing'].includes(overlay.status)) {
        lastChange = { id: ++changeId, flightId, kind: 'status', from: old?.status ?? null, to: overlay.status, at: overlay.receivedAt };
      } else if ((overlay.departureDelayMin ?? 0) !== (old?.departureDelayMin ?? 0) && overlay.departureDelayMin !== null) {
        lastChange = { id: ++changeId, flightId, kind: 'delay', from: String(old?.departureDelayMin ?? 0), to: String(overlay.departureDelayMin), at: overlay.receivedAt };
      }
      return { overlays: { ...s.overlays, [flightId]: overlay }, version: s.version + 1, lastSyncAt: overlay.receivedAt, lastError: null, lastChange };
    }),
  setSyncResult: error => set(s => ({ lastError: error, lastSyncAt: error ? s.lastSyncAt : Date.now() })),
  reset: () => set({ overlays: {}, etas: {}, version: 0, lastSyncAt: null, lastError: null, lastChange: null }),
}));

/** Call at the top of a screen that shows flight facts: it re-renders when the server's state changes. */
export const useFlightStatusVersion = () => useFlightStatus(s => s.version);
