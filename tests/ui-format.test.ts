import { describe, expect, it } from 'vitest';
import { correctionNote, metaLine, sourceLabel } from '../src/ui/format';

const stats = (o: Partial<{ timeToFirstTokenMs: number | null; tokensPerSecond: number | null }> = {}) => ({
  timeToFirstTokenMs: 420.4, tokensPerSecond: 12.34, totalMs: 1000, tokens: 20, ...o,
});

describe('sourceLabel', () => {
  it('maps every source in RO and EN', () => {
    expect(sourceLabel({ source: 'template' }, 'ro')).toBe('calculat din orar');
    expect(sourceLabel({ source: 'model' }, 'ro')).toBe('model local');
    expect(sourceLabel({ source: 'clarification' }, 'ro')).toBe('întrebare de clarificare');
    expect(sourceLabel({ source: 'guard_fallback' }, 'ro')).toBe('răspuns de siguranță');
    expect(sourceLabel({ source: 'model' }, 'en')).toBe('local model');
    expect(sourceLabel({ source: 'guard_fallback' }, 'en')).toBe('safety answer');
  });
});

describe('metaLine', () => {
  it('shows TTFT and tok/s for model answers', () => {
    expect(metaLine({ source: 'model', stats: stats() })).toBe('TTFT 420 ms · 12.3 tok/s');
  });
  it('is empty for template and clarification, even with real-looking stats', () => {
    const nul = stats({ timeToFirstTokenMs: null, tokensPerSecond: null });
    expect(metaLine({ source: 'template', stats: nul })).toBe('');
    expect(metaLine({ source: 'clarification', stats: nul })).toBe('');
    expect(metaLine({ source: 'template', stats: stats() })).toBe('');
  });
  it('never prints NaN/undefined/null', () => {
    for (const s of [stats({ timeToFirstTokenMs: NaN, tokensPerSecond: NaN }), stats({ timeToFirstTokenMs: null, tokensPerSecond: 0 }), undefined as never]) {
      const m = metaLine({ source: 'model', stats: s });
      expect(m).not.toMatch(/NaN|undefined|null/);
    }
    expect(metaLine({ source: 'model', stats: stats({ timeToFirstTokenMs: null }) })).toBe('12.3 tok/s');
  });
  it('guard_fallback shows stats because the model did run', () => {
    expect(metaLine({ source: 'guard_fallback', stats: stats() })).toBe('TTFT 420 ms · 12.3 tok/s');
    expect(metaLine({ source: 'guard_fallback', stats: stats({ timeToFirstTokenMs: null, tokensPerSecond: null }) })).toBe('');
  });
});

describe('correctionNote', () => {
  it('formats RO and EN', () => {
    const c = [{ from: 'bagjaul', to: 'bagajul' }];
    expect(correctionNote({ corrections: c }, 'ro')).toBe('am înțeles „bagajul” în loc de „bagjaul”');
    expect(correctionNote({ corrections: c }, 'en')).toBe('understood “bagajul” instead of “bagjaul”');
  });
  it('is empty without corrections', () => {
    expect(correctionNote({ corrections: [] }, 'ro')).toBe('');
    expect(correctionNote({ corrections: undefined as never }, 'en')).toBe('');
  });
  it('joins several and caps at three', () => {
    const c = ['a', 'b', 'c', 'd'].map((x) => ({ from: x + 'x', to: x }));
    expect(correctionNote({ corrections: c }, 'ro').split('; ')).toHaveLength(3);
  });
});
