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

export function stepStates(steps: JourneyStep[], completed: string[]): StepState[] {
  let currentFound = false;
  return steps.map(step => {
    if (step.skipped) return 'skipped';
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
