import terminal from '../data/terminal.json';

/**
 * The indoor map node of a gate. The terminal data has gates 1-4; the server can announce another one (gate 7), and a node that does not exist
 * left the map without a target. The nearest known gate is used then, so the map still opens (the real gate is still shown as text).
 */
const GATES = (terminal.nodes as { id: string }[])
  .map(n => /^f1_gate(\d+)$/.exec(n.id)?.[1])
  .filter((n): n is string => !!n)
  .map(Number)
  .sort((a, b) => a - b);

export function gateNodeId(gate: string | null | undefined): string {
  const n = Number(String(gate ?? '').replace(/\D/g, ''));
  if (GATES.length === 0) return 'f1_gate3';
  if (!Number.isFinite(n) || n <= 0) return `f1_gate${GATES[0]}`;
  const nearest = GATES.reduce((best, g) => (Math.abs(g - n) < Math.abs(best - n) ? g : best), GATES[0]!);
  return `f1_gate${nearest}`;
}
