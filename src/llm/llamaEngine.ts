import { initLlama, type LlamaContext } from 'llama.rn';
import type { ChatMessage, EngineToolCall, GenerateStats, LlmEngine } from '../core/assistant';
import { ContextOverflowError, fitToContext } from './fitContext';
import { parseToolCalls, renderQwen3 } from './qwenTemplate';

/** `kv`: the type of the attention cache. q8_0 halves it (about 140 MB less at 2048 tokens; needs flash attention, on by default on Metal). */
export type EngineConfig = { nCtx: number; nGpuLayers: number; kv?: 'f16' | 'q8_0' };
export const DEFAULT_CONFIG: EngineConfig = { nCtx: 2048, nGpuLayers: 99 };
/** Tokens of the window kept free for the answer: the prompt may use at most nCtx minus this. */
const ANSWER_ROOM = 128;

/** On-device inference via llama.rn (llama.cpp + Metal). No network involved. */
export class LlamaEngine implements LlmEngine {
  private ctx: LlamaContext | null = null;
  loadMs: number | null = null;

  loraPath: string | null = null;
  nCtx = DEFAULT_CONFIG.nCtx;

  /** Qwen3 non-thinking defaults (model card). Tests from the laptop change them at run time (deviceLink: setSampling). */
  sampling = { temperature: 0.7, topP: 0.8, topK: 20, penaltyPresent: 1.5 };
  /** 'jinja' = llama.rn formats the chat and parses tool calls; 'raw' = this app renders the exact Qwen3 prompt (renderQwen3) and parses with parseToolCalls. */
  promptMode: 'jinja' | 'raw' = 'jinja';

  private loaded: { modelPath: string; cfg: EngineConfig; loraPath: string | null } | null = null;
  /** How many times the Metal backend had to be recreated (shown in the test mode / benchmark). */
  recoveries = 0;
  /** How many prompts had to be shortened to fit the window (shown by the laptop's status command; a high number means the prompt is too big). */
  trims = 0;

  // Load, unload and recovery never overlap. Two simultaneous `initLlama` calls (the tab's warm-up, a laptop `load` command, a recovery)
  // each loaded the 2.7 GB model: ~5.4 GB on a 6 GB phone, which ended in an iOS kernel panic ("all vm-pageshortage victims exhausted").
  private chain: Promise<unknown> = Promise.resolve();
  private serial<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.chain.then(fn, fn);
    this.chain = run.catch(() => undefined);
    return run;
  }

  /** Idempotent: the same model, adapter and context size that is already loaded is not loaded again. */
  load(modelPath: string, cfg: EngineConfig = DEFAULT_CONFIG, onProgress?: (p: number) => void, loraPath?: string | null): Promise<void> {
    return this.serial(async () => {
      if (this.ctx) {
        const l = this.loaded;
        if (l && l.modelPath === modelPath && l.cfg.nCtx === cfg.nCtx && l.cfg.nGpuLayers === cfg.nGpuLayers && (l.cfg.kv ?? 'f16') === (cfg.kv ?? 'f16') && l.loraPath === (loraPath ?? null)) return;
        await this.ctx.release().catch(() => undefined);
        this.ctx = null;
      }
      await this.loadNow(modelPath, cfg, onProgress, loraPath);
    });
  }

  private async loadNow(modelPath: string, cfg: EngineConfig, onProgress?: (p: number) => void, loraPath?: string | null) {
    const t0 = Date.now();
    // Small batches keep every Metal command buffer short: one long prompt evaluation (about 1450 tokens, 15 s in a single
    // command buffer) made the GPU fail with kIOGPUCommandBufferCallbackErrorInnocentVictim on the iPhone 15, and llama.cpp then
    // refuses every later call ("backend is in error state ... recreate the backend to recover").
    this.ctx = await initLlama(
      { model: modelPath, n_ctx: cfg.nCtx, n_gpu_layers: cfg.nGpuLayers, n_batch: 256, n_ubatch: 128, use_mlock: false, ...(cfg.kv === 'q8_0' ? { cache_type_k: 'q8_0', cache_type_v: 'q8_0', flash_attn_type: 'on' } : {}), ...(loraPath ? { lora: loraPath } : {}) },
      onProgress,
    );
    this.loraPath = loraPath ?? null;
    this.nCtx = cfg.nCtx;
    this.loaded = { modelPath, cfg, loraPath: loraPath ?? null };
    this.loadMs = Date.now() - t0;
  }

  /** Releases the context and creates a new one with the same model, adapter and settings. */
  private recreate(): Promise<void> {
    return this.serial(async () => {
      const l = this.loaded;
      if (!l) throw new Error('Model not loaded');
      this.onStatus?.('recovering');
      await this.ctx?.release().catch(() => undefined);
      this.ctx = null;
      try {
        await this.loadNow(l.modelPath, l.cfg, undefined, l.loraPath);
        this.recoveries++;
      } finally {
        this.onStatus?.('ready');
      }
    });
  }

  /** The UI shows "restarting the AI engine" while this is 'recovering'. */
  onStatus?: (s: 'recovering' | 'ready') => void;

  get ready() {
    return this.ctx !== null;
  }

  unload(): Promise<void> {
    return this.serial(async () => {
      await this.ctx?.release();
      this.ctx = null;
    });
  }

  /** A generation that produced nothing at all (no text, no tool call, no tokens) means the GPU backend failed; recreate it and try once more. */
  async generate(
    messages: ChatMessage[],
    onToken: (partial: string) => void,
    opts?: { maxTokens?: number; tools?: unknown[] },
  ): Promise<{ text: string; stats: GenerateStats; toolCalls?: EngineToolCall[] }> {
    let failed = false;
    try {
      const r = await this.generateOnce(messages, onToken, opts);
      if (r.stats.tokens > 0 || r.text.trim() || r.toolCalls?.length) return r;
      failed = true;
    } catch (e) {
      // A prompt that cannot fit is the caller's problem, not a GPU failure: do not reload the model for it.
      if (e instanceof ContextOverflowError || !this.loaded) throw e;
      failed = true;
    }
    if (failed) await this.recreate();
    return this.generateOnce(messages, onToken, opts);
  }

  private async generateOnce(
    input: ChatMessage[],
    onToken: (partial: string) => void,
    opts?: { maxTokens?: number; tools?: unknown[] },
  ): Promise<{ text: string; stats: GenerateStats; toolCalls?: EngineToolCall[] }> {
    if (!this.ctx) throw new Error('Model not loaded');
    // Never hand llama.cpp a prompt longer than the window (see fitContext.ts: one such call aborted the app). The last tool result is shortened if needed.
    const ctx = this.ctx;
    const { messages, tokens: promptTokens, trimmed } = await fitToContext(input, m => renderQwen3(m as never, opts?.tools), async t => (await ctx.tokenize(t)).tokens.length, this.nCtx - ANSWER_ROOM);
    if (trimmed) this.trims++;
    // Prompt plus answer never exceed the window either: the answer is capped by what is left.
    const predict = Math.max(16, Math.min(opts?.maxTokens ?? 320, this.nCtx - promptTokens - 4));
    const t0 = Date.now();
    let first: number | null = null;
    let text = '';
    if (this.promptMode === 'raw') {
      const r = await this.ctx.completion(
        {
          prompt: renderQwen3(messages as never, opts?.tools),
          n_predict: predict,
          temperature: this.sampling.temperature,
          top_p: this.sampling.topP,
          top_k: this.sampling.topK,
          min_p: 0,
          penalty_present: this.sampling.penaltyPresent,
          stop: ['<|im_end|>', '<|im_start|>'],
        },
        d => {
          if (first === null) first = Date.now() - t0;
          text = d.accumulated_text ?? text + d.token;
          onToken(text);
        },
      );
      const parsed = parseToolCalls(String(r.text ?? text));
      return {
        toolCalls: parsed.toolCalls,
        text: parsed.content,
        stats: { timeToFirstTokenMs: first, tokensPerSecond: r.timings?.predicted_per_second ?? null, totalMs: Date.now() - t0, tokens: r.timings?.predicted_n ?? r.tokens_predicted ?? 0 },
      };
    }
    const res = await this.ctx.completion(
      {
        // llama.rn's message type lacks tool fields; the native side accepts them for tool-calling templates.
        messages: messages as never,
        ...(opts?.tools?.length ? { tools: opts.tools, tool_choice: 'auto' } : {}),
        jinja: true,
        enable_thinking: false, // non-thinking mode for latency
        reasoning_format: 'none',
        n_predict: predict,
        // Qwen3 non-thinking recommendations (model card): T0.7, top_p 0.8, top_k 20, min_p 0
        temperature: this.sampling.temperature,
        top_p: this.sampling.topP,
        top_k: this.sampling.topK,
        min_p: 0,
        penalty_present: this.sampling.penaltyPresent,
        stop: ['<|im_end|>', '<|im_start|>'],
      },
      (d) => {
        if (first === null) first = Date.now() - t0;
        text = d.accumulated_text ?? text + d.token;
        onToken(text);
      },
    );
    const cleaned = (res.content ?? res.text ?? text).replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    const toolCalls = (res.tool_calls ?? []).map((c) => ({ id: c.id, name: c.function.name, arguments: c.function.arguments }));
    return {
      toolCalls,
      text: cleaned,
      stats: {
        timeToFirstTokenMs: first,
        tokensPerSecond: res.timings?.predicted_per_second ?? null,
        totalMs: Date.now() - t0,
        tokens: res.timings?.predicted_n ?? res.tokens_predicted ?? 0,
      },
    };
  }

  /** One raw completion (no chat template, no tools): what the RoLlama router was trained on. Greedy, short, stops at the end of the JSON line. */
  async completeRaw(prompt: string, opts: { maxTokens?: number; grammar?: string } = {}): Promise<{ text: string; stats: GenerateStats }> {
    if (!this.ctx) throw new Error('Model not loaded');
    const t0 = Date.now();
    let first: number | null = null;
    const res = await this.ctx.completion(
      { prompt, n_predict: opts.maxTokens ?? 48, temperature: 0, top_k: 1, penalty_repeat: 1.1, ...(opts.grammar ? { grammar: opts.grammar } : {}), stop: ['\n', '<|eot_id|>', '<|end_of_text|>'] },
      () => {
        if (first === null) first = Date.now() - t0;
      },
    );
    const text = String(res.text ?? '').trim();
    return { text, stats: { timeToFirstTokenMs: first, tokensPerSecond: res.timings?.predicted_per_second ?? null, totalMs: Date.now() - t0, tokens: res.timings?.predicted_n ?? res.tokens_predicted ?? 0 } };
  }

  async stop() {
    await this.ctx?.stopCompletion();
  }
}
