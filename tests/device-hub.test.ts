import { describe, expect, it } from 'vitest';
import { DeviceHub } from '../server/gateway/deviceHub';

describe('DeviceHub', () => {
  it('a waiting poll receives a command queued later; an empty poll times out with null', async () => {
    const hub = new DeviceHub();
    const waiting = hub.poll(undefined, 2000);
    const id = hub.enqueue({ type: 'ping' });
    expect(await waiting).toMatchObject({ id, type: 'ping' });
    expect(await hub.poll(undefined, 30)).toBeNull();
  });
  it('commands queue in order while nobody is polling; a new poll releases an older one', async () => {
    const hub = new DeviceHub();
    const a = hub.enqueue({ type: 'a' });
    const b = hub.enqueue({ type: 'b' });
    expect((await hub.poll(undefined, 10))?.id).toBe(a);
    expect((await hub.poll(undefined, 10))?.id).toBe(b);
    const first = hub.poll(undefined, 5000);
    void hub.poll(undefined, 20);
    expect(await first).toBeNull();
  });
  it('reports items and completion, and "connected" depends on the last contact', () => {
    let t = 1_000_000;
    const hub = new DeviceHub(() => t);
    const id = hub.enqueue({ type: 'bench' });
    hub.report(id, { item: 1 });
    hub.report(id, { item: 2 });
    expect(hub.result(id, 1)).toMatchObject({ items: [2], total: 2, done: false });
    hub.report(id, { done: true });
    expect(hub.result(id)?.done).toBe(true);
    expect(hub.status().connected).toBe(true);
    t += 60_000;
    expect(hub.status().connected).toBe(false);
  });
});
