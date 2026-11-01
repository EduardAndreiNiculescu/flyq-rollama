/**
 * Pedestrian dead reckoning for the 3D map: the phone's own sensors move the pin when the camera is not localizing.
 *  - accelerometer: one peak per step (the same detector as Denis's web prototype, tools/terminal/prototype/template.html);
 *  - compass: the iOS heading (already fused with the gyroscope by the system), smoothed here, minus the map's north offset (`northDeg`);
 *  - gyroscope: a step is not counted while the phone is being swung or turned fast (it would be a false step).
 * The pure parts (StepDetector, HeadingFilter, DeadReckoner) are tested; PdrSession only connects them to expo-sensors and expo-location.
 */
export const STEP_LENGTH_M = 0.7;
const G = 9.81;

const norm360 = (d: number) => ((d % 360) + 360) % 360;
/** The shortest signed difference a - b, in -180..180 */
export const angleDiff = (a: number, b: number) => ((((a - b) % 360) + 540) % 360) - 180;

/** Accelerometer samples (in m/s², gravity included) in, a step out */
export class StepDetector {
  private base = G;
  private f = G;
  private armed = true;
  private lastStep = -Infinity;
  /** Returns true when this sample is a step */
  push(ax: number, ay: number, az: number, nowMs: number): boolean {
    const m = Math.hypot(ax, ay, az);
    this.f += (m - this.f) * 0.3; // ~50 ms smoothing
    this.base += (m - this.base) * 0.005; // gravity, adapting over a few seconds
    const lift = this.f - this.base;
    if (this.armed && lift > 1.1 && nowMs - this.lastStep > 280) {
      this.armed = false;
      this.lastStep = nowMs;
      return true;
    }
    if (!this.armed && lift < 0.35) this.armed = true;
    return false;
  }
}

/** Compass readings in, a steady heading out (circular low-pass; the first reading is taken as it is) */
export class HeadingFilter {
  private h: number | null = null;
  constructor(private alpha = 0.18) {}
  update(rawDeg: number): number {
    this.h = this.h === null ? norm360(rawDeg) : norm360(this.h + this.alpha * angleDiff(rawDeg, this.h));
    return this.h;
  }
  get value(): number | null {
    return this.h;
  }
  reset(): void {
    this.h = null;
  }
}

/** Position on the map (x east, z south; the map's north is -z) moved step by step along the heading */
export class DeadReckoner {
  constructor(
    public x: number,
    public z: number,
    private northDeg = 0,
    private stepM = STEP_LENGTH_M,
  ) {}
  /** The compass bearing (clockwise from north) as a map heading (clockwise from the map's north) */
  mapHeading(compassDeg: number): number {
    return norm360(compassDeg - this.northDeg);
  }
  step(compassDeg: number): { x: number; z: number; headingDeg: number } {
    const h = this.mapHeading(compassDeg);
    const r = (h * Math.PI) / 180;
    this.x += this.stepM * Math.sin(r);
    this.z -= this.stepM * Math.cos(r);
    return { x: this.x, z: this.z, headingDeg: h };
  }
  moveTo(x: number, z: number): void {
    this.x = x;
    this.z = z;
  }
}

export type PdrOutput = {
  onPose: (pose: { x: number; z: number; headingDeg: number }) => void;
  onHeading: (headingDeg: number) => void;
  onStatus?: (status: 'running' | 'no-compass' | 'no-motion' | 'stopped') => void;
};

/** Connects the sensors (expo-sensors, expo-location) to the pure parts above. Loaded on use: nothing runs on a platform without them. */
export class PdrSession {
  private subs: { remove: () => void }[] = [];
  private reckoner: DeadReckoner;
  private steps = new StepDetector();
  private heading = new HeadingFilter();
  private spinning = false;
  private lastHeadingSent = 0;

  constructor(
    startX: number,
    startZ: number,
    private out: PdrOutput,
    northDeg = 0,
  ) {
    this.reckoner = new DeadReckoner(startX, startZ, northDeg);
  }

  async start(): Promise<boolean> {
    try {
      const [{ Accelerometer, Gyroscope }, Location] = await Promise.all([import('expo-sensors'), import('expo-location')]);
      const perm = await Location.requestForegroundPermissionsAsync();
      if (!perm.granted) {
        this.out.onStatus?.('no-compass');
        return false;
      }
      Accelerometer.setUpdateInterval(20); // 50 Hz
      Gyroscope.setUpdateInterval(50);
      this.subs.push(
        Gyroscope.addListener(({ x, y, z }) => {
          this.spinning = Math.hypot(x, y, z) > 5; // rad/s: swinging or turning the phone, not walking
        }),
        Accelerometer.addListener(({ x, y, z }) => {
          const heading = this.heading.value;
          if (heading !== null && !this.spinning && this.steps.push(x * G, y * G, z * G, Date.now())) {
            this.out.onPose(this.reckoner.step(heading));
          }
        }),
      );
      const watch = await Location.watchHeadingAsync(h => {
        const raw = h.trueHeading >= 0 ? h.trueHeading : h.magHeading;
        const smooth = this.heading.update(raw);
        const now = Date.now();
        if (now - this.lastHeadingSent > 200) {
          this.lastHeadingSent = now;
          this.out.onHeading(this.reckoner.mapHeading(smooth));
        }
      });
      this.subs.push(watch);
      this.out.onStatus?.('running');
      return true;
    } catch {
      this.out.onStatus?.('no-motion');
      return false;
    }
  }

  /** The user was placed somewhere else (a tap on the map, the camera): the next steps start from there */
  moveTo(x: number, z: number): void {
    this.reckoner.moveTo(x, z);
  }

  stop(): void {
    for (const s of this.subs) s.remove();
    this.subs = [];
    this.heading.reset();
    this.out.onStatus?.('stopped');
  }
}
