import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => {
  const state = { inits: 0, live: 0, maxLive: 0, releases: 0 };
  const initLlama = async () => {
    state.inits++;
    state.live++;
    state.maxLive = Math.max(state.maxLive, state.live);
    await new Promise(r => setTimeout(r, 5));
    return {
      release: async () => {
        state.releases++;
        state.live--;
      },
    };
  };
  return { state, initLlama };
});
vi.mock('llama.rn', () => ({ initLlama: h.initLlama }));

import { LlamaEngine } from '../src/llm/llamaEngine';

beforeEach(() => Object.assign(h.state, { inits: 0, live: 0, maxLive: 0, releases: 0 }));

// Two simultaneous loads of the 2.7 GB model on a 6 GB iPhone ended in a kernel panic; loading must be one at a time and idempotent.
describe('model lifecycle', () => {
  it('simultaneous loads of the same model create one context', async () => {
    const e = new LlamaEngine();
    await Promise.all([e.load('m.gguf'), e.load('m.gguf'), e.load('m.gguf')]);
    expect(h.state.inits).toBe(1);
    expect(e.ready).toBe(true);
  });
  it('a different context size releases the old context before creating the new one', async () => {
    const e = new LlamaEngine();
    await Promise.all([e.load('m.gguf', { nCtx: 2048, nGpuLayers: 99 }), e.load('m.gguf', { nCtx: 4096, nGpuLayers: 99 })]);
    expect(h.state.inits).toBe(2);
    expect(h.state.maxLive).toBe(1);
    expect(h.state.live).toBe(1);
  });
  it('an unload that races a load never leaves two contexts alive', async () => {
    const e = new LlamaEngine();
    await Promise.all([e.load('m.gguf'), e.unload(), e.load('m.gguf')]);
    expect(h.state.maxLive).toBe(1);
    expect(h.state.live).toBe(1);
    expect(e.ready).toBe(true);
  });
});
