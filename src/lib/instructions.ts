import type { RoutePoint, Route, TerminalNode } from '../types';
import { pointAlong } from './astar';

export type Instruction =
  | { kind: 'turn'; distM: number; dir: 'left' | 'right'; landmark?: TerminalNode['landmark'] }
  | { kind: 'straight'; distM: number; landmark?: TerminalNode['landmark'] }
  | { kind: 'floor'; floor: number; via?: TerminalNode['landmark'] }
  | { kind: 'wait'; landmark?: TerminalNode['landmark'] }
  | { kind: 'arrived'; landmark?: TerminalNode['landmark'] };

const TURN_DEG = 30;
const ARRIVED_M = 2;

function heading(a: RoutePoint, b: RoutePoint) {
  return { x: b.x - a.x, y: b.y - a.y };
}

/** Unghiul (grade, cu semn) dintre două direcții; pozitiv = viraj la dreapta (axa y crește spre sud). */
function turnAngle(a: RoutePoint, b: RoutePoint, c: RoutePoint): number {
  const h1 = heading(a, b);
  const h2 = heading(b, c);
  const cross = h1.x * h2.y - h1.y * h2.x;
  const dot = h1.x * h2.x + h1.y * h2.y;
  return (Math.atan2(cross, dot) * 180) / Math.PI;
}

/**
 * Instrucțiunea următoare pentru poziția `s` (metri parcurși pe rută).
 * Segmentele aproape coliniare se unesc, ca să nu spunem „mergi drept” la fiecare nod.
 */
export function nextInstruction(
  route: Route,
  s: number,
  nodes: Map<string, TerminalNode>,
  waitingAtCheckpoint = false,
): Instruction {
  const pts = route.points;
  const last = pts[pts.length - 1]!;
  const destination = nodes.get(last.nodeId)?.landmark;
  const remaining = route.lengthM - s;

  if (remaining <= ARRIVED_M) return { kind: 'arrived', landmark: destination };

  const here = pointAlong(route, s);
  if (waitingAtCheckpoint) {
    const reached = pts[here.segment - 1];
    return { kind: 'wait', landmark: reached ? nodes.get(reached.nodeId)?.landmark : undefined };
  }

  let dist = Math.hypot(pts[here.segment]!.x - here.x, pts[here.segment]!.y - here.y);
  for (let i = here.segment; i < pts.length - 1; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    const c = pts[i + 1]!;
    if (c.floor !== b.floor) {
      // Dacă scara e chiar aici, spunem direct să urci; altfel, mai întâi drumul până la ea
      if (dist <= ARRIVED_M + 1) return { kind: 'floor', floor: c.floor, via: nodes.get(b.nodeId)?.landmark };
      return { kind: 'straight', distM: dist, landmark: nodes.get(b.nodeId)?.landmark };
    }
    if (a.floor !== b.floor) {
      dist += Math.hypot(c.x - b.x, c.y - b.y);
      continue;
    }
    const angle = turnAngle(a, b, c);
    if (Math.abs(angle) >= TURN_DEG) {
      // Reperul spre care te duce virajul: primul nod cu nume după punctul de viraj
      const landmark = pts.slice(i + 1).map(p => nodes.get(p.nodeId)?.landmark).find(Boolean);
      return { kind: 'turn', distM: dist, dir: angle > 0 ? 'right' : 'left', landmark };
    }
    dist += Math.hypot(c.x - b.x, c.y - b.y);
  }
  return { kind: 'straight', distM: dist, landmark: destination };
}

/** Împarte ruta de pe un etaj în partea parcursă și partea rămasă. */
export function splitRouteOnFloor(route: Route, s: number, floor: number): { done: RoutePoint[][]; todo: RoutePoint[][] } {
  const here = pointAlong(route, s);
  const cut: RoutePoint = { x: here.x, y: here.y, floor: here.floor, nodeId: '' };
  const before = [...route.points.slice(0, here.segment), cut];
  const after = [cut, ...route.points.slice(here.segment)];
  const byFloor = (points: RoutePoint[]) => {
    const runs: RoutePoint[][] = [];
    let run: RoutePoint[] = [];
    for (const p of points) {
      if (p.floor === floor) run.push(p);
      else if (run.length) {
        runs.push(run);
        run = [];
      }
    }
    if (run.length) runs.push(run);
    // Bucățile de lungime zero (de exemplu la start) nu se desenează
    return runs.filter(r => r.length > 1 && r.some((p, i) => i > 0 && Math.hypot(p.x - r[i - 1]!.x, p.y - r[i - 1]!.y) > 0.01));
  };
  return { done: byFloor(before), todo: byFloor(after) };
}
