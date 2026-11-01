import type { Airport, Flight, Ticket } from '../types';
import { gateNodeId } from './gateNode';

export type StepId = 'arrive' | 'checkin' | 'security' | 'passport' | 'gate' | 'boarding';
export type PrepKey = 'liquids' | 'laptop' | 'document' | 'pass' | 'bag' | 'toilet';

export interface JourneyStep {
  id: StepId;
  /** Durata estimată a pasului, în minute (folosită pentru „Acum · ~10 min” și pentru timpul de mers) */
  etaMin: number;
  /** Nodul din terminal.json arătat pe hartă */
  targetNodeId: string;
  prep: PrepKey[];
  skipped: boolean;
}

/** Pașii prin aeroport pentru un bilet. Controlul pașapoartelor apare doar la zboruri non-Schengen. */
export function buildSteps(ticket: Ticket, flight: Flight, from: Airport, to: Airport): JourneyStep[] {
  const skipCheckin = ticket.checkedInOnline && !ticket.hasCheckedBag;
  const needsPassport = from.schengen && !to.schengen;
  const gateNode = gateNodeId(flight.gate);
  const steps: JourneyStep[] = [
    { id: 'arrive', etaMin: 2, targetNodeId: 'f0_entrance', prep: ['pass'], skipped: false },
    { id: 'checkin', etaMin: 15, targetNodeId: 'f0_bagdrop', prep: ['bag', 'document'], skipped: skipCheckin },
    { id: 'security', etaMin: 10, targetNodeId: 'f0_sec_in', prep: ['liquids', 'laptop'], skipped: false },
  ];
  if (needsPassport) steps.push({ id: 'passport', etaMin: 8, targetNodeId: 'f1_pass_in', prep: ['document'], skipped: false });
  steps.push({ id: 'gate', etaMin: 4, targetNodeId: gateNode, prep: ['toilet'], skipped: false });
  steps.push({ id: 'boarding', etaMin: 15, targetNodeId: gateNode, prep: ['pass', 'document'], skipped: false });
  return steps;
}

export type StepState = 'done' | 'current' | 'next' | 'skipped';

/** The gate area opens this long before departure, and boarding this long before the boarding time: earlier, those steps cannot be started or ticked */
export const GATE_OPENS_BEFORE_DEPARTURE_MIN = 90;
export const BOARDING_OPENS_BEFORE_MIN = 5;

/** For each step, the moment (epoch ms) it becomes available, or null when it is open now */
export function stepOpensAt(steps: JourneyStep[], flight: Flight, nowMs: number): (number | null)[] {
  return steps.map(step => {
    const at =
      step.id === 'gate' ? Date.parse(flight.departureUtc) - GATE_OPENS_BEFORE_DEPARTURE_MIN * 60_000
      : step.id === 'boarding' ? Date.parse(flight.boardingUtc) - BOARDING_OPENS_BEFORE_MIN * 60_000
      : null;
    return at !== null && nowMs < at ? at : null;
  });
}

/**
 * `opensAt` (from stepOpensAt): a step that is not open yet is only "next", whatever was ticked before, and nothing after it can be current or done.
 * Without it, "I am at the gate" could be reached hours before boarding.
 */
export function stepStates(steps: JourneyStep[], completed: string[], opensAt?: (number | null)[]): StepState[] {
  let currentFound = false;
  let blocked = false;
  return steps.map((step, i) => {
    if (step.skipped) return 'skipped';
    if (opensAt?.[i] != null) blocked = true;
    if (blocked) return 'next';
    if (completed.includes(step.id)) return 'done';
    if (!currentFound) {
      currentFound = true;
      return 'current';
    }
    return 'next';
  });
}

/** Minutele de mers rămase până la poartă, adunând pașii neterminați de dinaintea porții. */
export function remainingWalkMin(steps: JourneyStep[], states: StepState[]): number {
  let total = 0;
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i]!;
    if (step.id === 'boarding') break;
    if (states[i] === 'current' || states[i] === 'next') total += step.etaMin;
  }
  return total;
}

export const URGENT_GATE_MIN = 30;
