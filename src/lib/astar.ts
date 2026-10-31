import type { Route, RoutePoint, Terminal, TerminalNode } from '../types';

// Rutare A* pe graful terminalului. Distanțele sunt în metri; schimbarea de etaj
// are un cost fix, ca ruta să nu urce și să coboare fără rost.
const FLOOR_HEIGHT_M = 6;
const STAIRS_PENALTY_M = 12;
const LIFT_PENALTY_M = 20;

export interface RouteOptions {
  /** Pentru accesibilitate: evită scările, folosește liftul */
  avoidStairs?: boolean;
}

interface Neighbor {
  id: string;
  cost: number;
}

export interface TerminalGraph {
  nodes: Map<string, TerminalNode>;
  adjacency: Map<string, Neighbor[]>;
}

function distance(a: TerminalNode, b: TerminalNode): number {
  const dz = (a.floor - b.floor) * FLOOR_HEIGHT_M;
  return Math.hypot(a.x - b.x, a.y - b.y, dz);
}

export function buildGraph(terminal: Terminal, options: RouteOptions = {}): TerminalGraph {
  const nodes = new Map(terminal.nodes.map(node => [node.id, node]));
  const adjacency = new Map<string, Neighbor[]>(terminal.nodes.map(node => [node.id, []]));

  for (const edge of terminal.edges) {
    const a = nodes.get(edge.from);
    const b = nodes.get(edge.to);
    if (!a || !b) throw new Error(`Muchie către un nod inexistent: ${edge.from} → ${edge.to}`);
    if (options.avoidStairs && edge.kind === 'stairs') continue;
    const penalty = edge.kind === 'stairs' ? STAIRS_PENALTY_M : edge.kind === 'lift' ? LIFT_PENALTY_M : 0;
    const cost = distance(a, b) + penalty;
    adjacency.get(a.id)!.push({ id: b.id, cost });
    if (!edge.oneWay) adjacency.get(b.id)!.push({ id: a.id, cost });
  }
  return { nodes, adjacency };
}

export function findRoute(graph: TerminalGraph, startId: string, goalId: string): Route | null {
  const goal = graph.nodes.get(goalId);
  const start = graph.nodes.get(startId);
  if (!goal || !start) return null;

  const open = new Set<string>([startId]);
  const cameFrom = new Map<string, string>();
  const g = new Map<string, number>([[startId, 0]]);
  const f = new Map<string, number>([[startId, distance(start, goal)]]);

  while (open.size > 0) {
    // Graful are ~50 de noduri: o căutare liniară e mai simplă decât un heap și la fel de rapidă
    let current = '';
    let best = Infinity;
    for (const id of open) {
      const score = f.get(id) ?? Infinity;
      if (score < best) {
        best = score;
        current = id;
      }
    }

    if (current === goalId) return buildRoute(graph, cameFrom, current);
    open.delete(current);

    for (const neighbor of graph.adjacency.get(current) ?? []) {
      const tentative = (g.get(current) ?? Infinity) + neighbor.cost;
      if (tentative < (g.get(neighbor.id) ?? Infinity)) {
        cameFrom.set(neighbor.id, current);
        g.set(neighbor.id, tentative);
        f.set(neighbor.id, tentative + distance(graph.nodes.get(neighbor.id)!, goal));
        open.add(neighbor.id);
      }
    }
  }
  return null;
}

function buildRoute(graph: TerminalGraph, cameFrom: Map<string, string>, endId: string): Route {
  const ids = [endId];
  let cursor = endId;
  while (cameFrom.has(cursor)) {
    cursor = cameFrom.get(cursor)!;
    ids.unshift(cursor);
  }
  const points: RoutePoint[] = ids.map(id => {
    const node = graph.nodes.get(id)!;
    return { x: node.x, y: node.y, floor: node.floor, nodeId: id };
  });
  return { points, lengthM: routeLength(points) };
}

/** Lungimea mersului pe jos; urcarea între etaje nu adaugă distanță orizontală. */
export function routeLength(points: RoutePoint[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    if (a.floor === b.floor) total += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return total;
}

/** Punctul aflat la `s` metri de la începutul rutei. */
export function pointAlong(route: Route, s: number): { x: number; y: number; floor: number; segment: number } {
  const pts = route.points;
  let remaining = Math.max(0, s);
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    if (a.floor !== b.floor) continue;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (remaining <= len) {
      const t = len === 0 ? 0 : remaining / len;
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, floor: a.floor, segment: i };
    }
    remaining -= len;
  }
  const last = pts[pts.length - 1]!;
  return { x: last.x, y: last.y, floor: last.floor, segment: pts.length - 1 };
}
