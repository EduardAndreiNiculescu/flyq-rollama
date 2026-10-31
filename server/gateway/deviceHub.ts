// Remote control of the phone app from the laptop, over the gateway (the phone only makes OUTBOUND requests, so no port is opened on it).
//   laptop  -> POST /v1/device/cmd {type, ...}          queue a command, get its id
//   phone   -> GET  /v1/device/poll                     long-poll: the next command (or none after ~20 s)
//   phone   -> POST /v1/device/result {cmdId, ...}      progress items and the final result
//   laptop  -> GET  /v1/device/result/{id}              what has arrived so far
//   laptop  -> GET  /v1/device/status                   is the phone connected, what is it running
// Everything is in memory and single-device on purpose: it is a test tool, not a product feature.

export type DeviceCmd = { id: string; type: string; [k: string]: unknown };
export type CmdResult = { items: unknown[]; done: boolean; data?: unknown; error?: string; updatedAt: number };

const LONG_POLL_MS = 20_000;
const MAX_RESULTS = 50;

export class DeviceHub {
  private queue: DeviceCmd[] = [];
  private waiter: ((c: DeviceCmd | null) => void) | null = null;
  private results = new Map<string, CmdResult>();
  private seq = 0;
  lastSeen = 0;
  info: unknown = null;

  constructor(private nowMs: () => number = Date.now) {}

  enqueue(cmd: Omit<DeviceCmd, 'id'>): string {
    const id = `c${++this.seq}`;
    this.results.set(id, { items: [], done: false, updatedAt: this.nowMs() });
    if (this.results.size > MAX_RESULTS) this.results.delete(this.results.keys().next().value as string);
    const full = { ...cmd, id } as DeviceCmd;
    if (this.waiter) {
      const w = this.waiter;
      this.waiter = null;
      w(full);
    } else this.queue.push(full);
    return id;
  }

  /** The phone asks for work. At most one poll is open; a new one releases the old one. */
  poll(info: unknown, timeoutMs = LONG_POLL_MS): Promise<DeviceCmd | null> {
    this.lastSeen = this.nowMs();
    if (info !== undefined) this.info = info;
    const next = this.queue.shift();
    if (next) return Promise.resolve(next);
    this.waiter?.(null);
    return new Promise(resolve => {
      const timer = setTimeout(() => {
        if (this.waiter === done) this.waiter = null;
        resolve(null);
      }, timeoutMs);
      const done = (c: DeviceCmd | null) => {
        clearTimeout(timer);
        this.lastSeen = this.nowMs();
        resolve(c);
      };
      this.waiter = done;
    });
  }

  report(cmdId: string, p: { item?: unknown; done?: boolean; data?: unknown; error?: string }): boolean {
    const r = this.results.get(cmdId);
    if (!r) return false;
    if (p.item !== undefined) r.items.push(p.item);
    if (p.data !== undefined) r.data = p.data;
    if (p.error !== undefined) r.error = p.error;
    if (p.done || p.error !== undefined) r.done = true;
    r.updatedAt = this.nowMs();
    this.lastSeen = r.updatedAt;
    return true;
  }

  result(id: string, from = 0): (CmdResult & { total: number }) | null {
    const r = this.results.get(id);
    return r ? { ...r, items: r.items.slice(from), total: r.items.length } : null;
  }

  status() {
    const age = this.lastSeen ? this.nowMs() - this.lastSeen : null;
    return { connected: age !== null && age < 45_000, lastSeenMsAgo: age, info: this.info, queued: this.queue.length };
  }
}
