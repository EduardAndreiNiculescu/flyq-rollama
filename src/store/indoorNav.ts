import { create } from 'zustand';
import { buildGraph, findRoute, type TerminalGraph } from '../lib/astar';
import { indoorPosition, terminalService } from '../services';
import type { IndoorPosition, Route } from '../types';

// O singură sesiune de navigare pentru toată aplicația: harta din tab-ul Hartă și harta
// din Călătorie (pe tabletă) arată aceeași rută și aceeași poziție.
const START_NODE = 'f0_entrance';

interface IndoorNavState {
  targetNodeId: string | null;
  route: Route | null;
  graph: TerminalGraph | null;
  position: IndoorPosition | null;
  error: 'noRoute' | 'loadFailed' | null;
  speedMultiplier: number;
  navigateTo: (targetNodeId: string, avoidStairs: boolean) => void;
  setSpeed: (multiplier: number) => void;
  simulateDeviation: () => void;
  stop: () => void;
}

let unsubscribe: (() => void) | null = null;

export const useIndoorNav = create<IndoorNavState>((set, get) => ({
  targetNodeId: null,
  route: null,
  graph: null,
  position: null,
  error: null,
  speedMultiplier: 1,

  navigateTo: (targetNodeId, avoidStairs) => {
    let graph: TerminalGraph;
    try {
      graph = buildGraph(terminalService.getTerminal(), { avoidStairs });
    } catch {
      set({ error: 'loadFailed', route: null });
      return;
    }
    // Dacă suntem deja pe drum, pornim ruta nouă de la ultimul nod atins
    const current = get();
    const start = current.route && current.position ? nearestNodeOnRoute(current.route, current.position.progressM) : START_NODE;
    const route = findRoute(graph, start, targetNodeId) ?? findRoute(graph, START_NODE, targetNodeId);
    if (!route) {
      set({ error: 'noRoute', route: null, targetNodeId, graph });
      return;
    }
    unsubscribe?.();
    unsubscribe = indoorPosition.subscribe(position => set({ position }));
    indoorPosition.start(route);
    indoorPosition.debug?.setSpeedMultiplier(get().speedMultiplier);
    set({ targetNodeId, route, graph, error: null, position: null });
  },

  setSpeed: multiplier => {
    indoorPosition.debug?.setSpeedMultiplier(multiplier);
    set({ speedMultiplier: multiplier });
  },

  simulateDeviation: () => indoorPosition.debug?.simulateDeviation(),

  stop: () => {
    indoorPosition.stop();
    unsubscribe?.();
    unsubscribe = null;
    set({ route: null, position: null, targetNodeId: null });
  },
}));

function nearestNodeOnRoute(route: Route, progressM: number): string {
  let s = 0;
  let last = route.points[0]!.nodeId;
  for (let i = 1; i < route.points.length; i++) {
    const a = route.points[i - 1]!;
    const b = route.points[i]!;
    if (a.floor === b.floor) s += Math.hypot(b.x - a.x, b.y - a.y);
    if (s > progressM) break;
    last = b.nodeId;
  }
  return last;
}
