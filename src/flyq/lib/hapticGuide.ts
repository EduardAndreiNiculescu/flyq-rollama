/**
 * Haptic guidance along a route, for people who cannot follow the map on the screen. The native view says how far the phone points from the way to go
 * (`turnDeg`, positive = turn right) about twice a second; this turns it into vibration the user can read with the phone in the hand:
 *
 *   on course (within 15°)   one light tick every ~2 s: "keep going"
 *   a little left            ONE tap     ┐ the number of taps says the side,
 *   a little right           TWO taps    ┘ the pause between them says how far off (shorter = more)
 *   far to the left/right    the same, with firm taps and a short pause
 *   behind you (over 135°)   a long, rapid buzz: "turn around"
 *   arrived                  a success pattern
 *
 * Pure decisions here (`planPulse`), the timing and the device calls in `HapticGuide` with an injected `Haptics`, so it is tested without a phone.
 */
export type PulseKind = 'onCourse' | 'left' | 'right' | 'turnAround';
export type Pulse = { kind: PulseKind; taps: number; strong: boolean; intervalMs: number };

export const ON_COURSE_DEG = 15;
export const TURN_AROUND_DEG = 135;

/** What to feel for a given angle off the route */
export function planPulse(turnDeg: number): Pulse {
  const off = Math.abs(turnDeg);
  if (off <= ON_COURSE_DEG) return { kind: 'onCourse', taps: 1, strong: false, intervalMs: 2000 };
  if (off >= TURN_AROUND_DEG) return { kind: 'turnAround', taps: 3, strong: true, intervalMs: 600 };
  // 15° → 1400 ms between signals, 135° → 450 ms
  const t = (off - ON_COURSE_DEG) / (TURN_AROUND_DEG - ON_COURSE_DEG);
  return { kind: turnDeg < 0 ? 'left' : 'right', taps: turnDeg < 0 ? 1 : 2, strong: off >= 60, intervalMs: Math.round(1400 - t * 950) };
}

export interface Haptics {
  tap(strong: boolean): void;
  success(): void;
  warning(): void;
}

const TAP_GAP_MS = 130;
/** Spoken progress for VoiceOver users: at these distances (metres) */
const MILESTONES = [20, 10, 5];

export class HapticGuide {
  private lastFire = -Infinity;
  private lastKind: PulseKind | null = null;
  private spoken = new Set<number>();
  private timers: ReturnType<typeof setTimeout>[] = [];

  constructor(
    private haptics: Haptics,
    private speak: (text: string) => void = () => {},
    private now: () => number = Date.now,
  ) {}

  /** New reading from the phone. `turnDeg` positive = the way is to the right. */
  update(turnDeg: number, metersLeft: number): void {
    const t = this.now();
    const pulse = planPulse(turnDeg);
    // A change of what to feel is signalled at once; otherwise at the pace of the pulse
    const changed = pulse.kind !== this.lastKind;
    if (changed || t - this.lastFire >= pulse.intervalMs) {
      this.fire(pulse);
      this.lastFire = t;
      this.lastKind = pulse.kind;
    }
    for (const m of MILESTONES) {
      if (metersLeft <= m && !this.spoken.has(m)) {
        this.spoken.add(m);
        this.speak(`${m} metri`);
        break;
      }
    }
  }

  arrived(): void {
    this.cancelTimers();
    this.haptics.success();
    this.speak('Ai ajuns');
    this.reset();
  }

  stop(): void {
    this.cancelTimers();
    this.reset();
  }

  private reset(): void {
    this.lastFire = -Infinity;
    this.lastKind = null;
    this.spoken.clear();
  }

  private cancelTimers(): void {
    for (const id of this.timers) clearTimeout(id);
    this.timers = [];
  }

  private fire(p: Pulse): void {
    if (p.kind === 'turnAround') {
      this.haptics.warning();
      return;
    }
    this.haptics.tap(p.strong);
    for (let i = 1; i < p.taps; i++) {
      this.timers.push(setTimeout(() => this.haptics.tap(p.strong), i * TAP_GAP_MS));
    }
  }
}
