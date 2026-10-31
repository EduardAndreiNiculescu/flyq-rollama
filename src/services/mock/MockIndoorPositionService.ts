import { pointAlong } from '../../lib/astar';
import type { IndoorPosition, Route } from '../../types';
import type { IndoorPositionService, Unsubscribe } from '../types';

const WALK_SPEED_MS = 1.3;
const TICK_MS = 200;
// Incertitudinea crește pe segmentele drepte și scade la viraje, ca în PDR cu map matching
const SIGMA_MIN = 1.5;
const SIGMA_MAX = 8;
const SIGMA_GROWTH_PER_M = 0.05;
const TURN_ANGLE_DEG = 30;
const PAUSE_NODE_PREFIXES = ['f0_sec_in', 'f1_pass_in', 'f0_stairs', 'f0_lift'];
const PAUSE_MS = 3500;
const DEVIATION_MS = 7000;
const DEVIATION_OFFSET_M = 7;

export class MockIndoorPositionService implements IndoorPositionService {
  private route: Route | null = null;
  private s = 0;
  private sinceTurnM = 0;
  private lastSegment = 1;
  private timer: ReturnType<typeof setInterval> | null = null;
  private listeners = new Set<(p: IndoorPosition) => void>();
  private pausedUntil = 0;
  private pausedNodes = new Set<string>();
  private deviationUntil = 0;
  private speedMultiplier = 1;

  debug = {
    simulateDeviation: () => {
      this.deviationUntil = Date.now() + DEVIATION_MS;
    },
    setSpeedMultiplier: (multiplier: number) => {
      this.speedMultiplier = multiplier;
    },
  };

  start(route: Route): void {
    this.stop();
    this.route = route;
    this.s = 0;
    this.sinceTurnM = 0;
    this.lastSegment = 1;
    this.pausedNodes.clear();
    this.timer = setInterval(() => this.tick(), TICK_MS);
    this.emit('still');
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  subscribe(cb: (position: IndoorPosition) => void): Unsubscribe {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private tick() {
    const route = this.route;
    if (!route) return;
    const now = Date.now();

    if (now < this.deviationUntil) {
      this.emit('offRoute');
      return;
    }
    if (now < this.pausedUntil) {
      this.emit('still');
      return;
    }
    if (this.s >= route.lengthM) {
      this.emit('arrived');
      this.stop();
      return;
    }

    const step = WALK_SPEED_MS * this.speedMultiplier * (TICK_MS / 1000);
    this.s = Math.min(route.lengthM, this.s + step);
    this.sinceTurnM += step;

    const here = pointAlong(route, this.s);
    if (here.segment !== this.lastSegment) {
      if (this.isTurn(route, this.lastSegment)) this.sinceTurnM = 0;
      this.lastSegment = here.segment;
      const reached = route.points[here.segment - 1];
      if (reached && PAUSE_NODE_PREFIXES.includes(reached.nodeId) && !this.pausedNodes.has(reached.nodeId)) {
        this.pausedNodes.add(reached.nodeId);
        this.pausedUntil = now + PAUSE_MS;
      }
    }
    this.emit('walking');
  }

  private isTurn(route: Route, segment: number): boolean {
    const a = route.points[segment - 1];
    const b = route.points[segment];
    const c = route.points[segment + 1];
    if (!a || !b || !c || a.floor !== b.floor || b.floor !== c.floor) return true;
    const h1 = Math.atan2(b.y - a.y, b.x - a.x);
    const h2 = Math.atan2(c.y - b.y, c.x - b.x);
    let diff = Math.abs(((h2 - h1) * 180) / Math.PI) % 360;
    if (diff > 180) diff = 360 - diff;
    return diff > TURN_ANGLE_DEG;
  }

  private emit(status: IndoorPosition['status']) {
    const route = this.route;
    if (!route) return;
    const here = pointAlong(route, this.s);
    let { x, y } = here;
    let sigma = Math.min(SIGMA_MAX, SIGMA_MIN + this.sinceTurnM * SIGMA_GROWTH_PER_M);

    if (status === 'offRoute') {
      // Abatere perpendiculară pe direcția segmentului curent
      const a = route.points[here.segment - 1] ?? route.points[0]!;
      const b = route.points[here.segment] ?? a;
      const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      x += (-(b.y - a.y) / len) * DEVIATION_OFFSET_M;
      y += ((b.x - a.x) / len) * DEVIATION_OFFSET_M;
      sigma = 6.5;
    }

    const position: IndoorPosition = { x, y, floor: here.floor, sigma, status, progressM: this.s };
    this.listeners.forEach(cb => cb(position));
  }
}
