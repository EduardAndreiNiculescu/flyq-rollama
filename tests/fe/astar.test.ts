import { describe, it, expect } from 'vitest';
import terminalJson from '../../src/data/terminal.json';
import { buildGraph, findRoute, pointAlong } from '../../src/lib/astar';
import type { Terminal } from '../../src/types';

const terminal = terminalJson as Terminal;

describe('terminal.json', () => {
  it('are două etaje și în jur de 40 de noduri', () => {
    expect(terminal.floors).toHaveLength(2);
    expect(terminal.nodes.length).toBeGreaterThanOrEqual(38);
  });

  it('toate muchiile leagă noduri existente', () => {
    const ids = new Set(terminal.nodes.map(n => n.id));
    for (const edge of terminal.edges) {
      expect(ids.has(edge.from)).toBe(true);
      expect(ids.has(edge.to)).toBe(true);
    }
  });
});

describe('findRoute', () => {
  const graph = buildGraph(terminal);

  it('găsește drumul de la intrare la Poarta 3 prin securitate și pașapoarte', () => {
    const route = findRoute(graph, 'f0_entrance', 'f1_gate3');
    expect(route).not.toBeNull();
    const ids = route!.points.map(p => p.nodeId);
    expect(ids[0]).toBe('f0_entrance');
    expect(ids[ids.length - 1]).toBe('f1_gate3');
    expect(ids).toEqual(expect.arrayContaining(['f0_sec_in', 'f0_sec_out', 'f1_pass_in', 'f1_pass_out']));
    expect(ids.indexOf('f0_sec_in')).toBeLessThan(ids.indexOf('f0_sec_out'));
    expect(route!.lengthM).toBeGreaterThan(150);
  });

  it('securitatea e unidirecțională: nu te poți întoarce din zona de plecări', () => {
    expect(findRoute(graph, 'f0_air', 'f0_entrance')).toBeNull();
  });

  it('controlul pașapoartelor e unidirecțional', () => {
    expect(findRoute(graph, 'f1_gate3', 'f1_gate1')).toBeNull();
  });

  it('fără scări, ruta folosește liftul', () => {
    const accessible = findRoute(buildGraph(terminal, { avoidStairs: true }), 'f0_entrance', 'f1_gate3');
    const ids = accessible!.points.map(p => p.nodeId);
    expect(ids).toContain('f0_lift');
    expect(ids).not.toContain('f0_stairs');
  });

  it('pointAlong merge pe segmente și rămâne la capăt după final', () => {
    const route = findRoute(graph, 'f0_entrance', 'f0_hall_c')!;
    expect(pointAlong(route, 0)).toMatchObject({ x: 40, y: 102 });
    expect(pointAlong(route, 10)).toMatchObject({ x: 40, y: 92 });
    expect(pointAlong(route, 999)).toMatchObject({ x: 40, y: 80 });
  });
});
