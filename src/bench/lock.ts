/** One model, one question at a time: chat messages, remote commands and the benchmark wait for each other instead of colliding. */
export class Mutex {
  private tail: Promise<void> = Promise.resolve();
  async acquire(): Promise<() => void> {
    let release!: () => void;
    const next = new Promise<void>(r => (release = r));
    const prev = this.tail;
    this.tail = prev.then(() => next);
    await prev;
    return release;
  }
}
