import { describe, it, expect } from 'vitest';
import terminalJson from '../../src/data/terminal.json';
import { buildGraph, findRoute } from '../../src/lib/astar';
import { nextInstruction, splitRouteOnFloor } from '../../src/lib/instructions';
import type { Terminal } from '../../src/types';

const terminal = terminalJson as Terminal;
const graph = buildGraph(terminal);
const route = findRoute(graph, 'f0_entrance', 'f1_gate3')!;

describe('nextInstruction', () => {
  it('la intrare: mergi drept prin hală, apoi la stânga spre Securitate', () => {
    // Intrare (40,102) → coridor drept până la (40,46), apoi la stânga spre securitate (32,44)
    const start = nextInstruction(route, 0, graph.nodes);
    expect(start).toMatchObject({ kind: 'turn', dir: 'left' });
    expect(start.kind === 'turn' && start.landmark?.ro).toBe('Securitate');
    expect(start.kind === 'turn' && Math.round(start.distM)).toBe(56);
  });

  it('cu 20 m înainte de viraj, distanța scade corespunzător', () => {
    const instr = nextInstruction(route, 36, graph.nodes);
    expect(instr.kind === 'turn' && Math.round(instr.distM)).toBe(20);
  });

  it('la scară spune să urci la etajul 1', () => {
    const idx = route.points.findIndex(p => p.nodeId === 'f0_stairs');
    let s = 0;
    for (let i = 1; i <= idx; i++) {
      const a = route.points[i - 1]!;
      const b = route.points[i]!;
      if (a.floor === b.floor) s += Math.hypot(b.x - a.x, b.y - a.y);
    }
    expect(nextInstruction(route, s, graph.nodes)).toMatchObject({ kind: 'floor', floor: 1 });
  });

  it('la final anunță sosirea la Poarta 3', () => {
    const instr = nextInstruction(route, route.lengthM, graph.nodes);
    expect(instr.kind).toBe('arrived');
    expect(instr.kind === 'arrived' && instr.landmark?.ro).toBe('Poarta 3');
  });
});

describe('splitRouteOnFloor', () => {
  it('la start, nimic nu e parcurs, iar etajul 0 are traseu rămas', () => {
    const { done, todo } = splitRouteOnFloor(route, 0, 0);
    expect(done).toHaveLength(0);
    expect(todo.length).toBeGreaterThan(0);
  });

  it('pe etajul 1 nu e nimic parcurs cât timp ești la etajul 0', () => {
    const { done } = splitRouteOnFloor(route, 30, 1);
    expect(done).toHaveLength(0);
  });
});
