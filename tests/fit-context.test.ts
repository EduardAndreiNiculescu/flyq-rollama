import { describe, expect, it } from 'vitest';
import type { ChatMessage } from '../src/core/assistant';
import { ContextOverflowError, fitToContext } from '../src/llm/fitContext';

const render = (m: ChatMessage[]) => m.map(x => `${x.role}\n${x.content}`).join('\n');
const count = async (t: string) => Math.ceil(t.length / 3); // a stand-in for the model's tokenizer
const doc = (id: string, n: number) => ({ id, title: id, text: `${id} `.repeat(n) });
const msgs = (docs: unknown[], system = 'sys'): ChatMessage[] => [
  { role: 'system', content: system },
  { role: 'user', content: 'ce fac?' },
  { role: 'assistant', content: '' },
  { role: 'tool', content: JSON.stringify({ result: { documents: docs, note: 'x' } }) },
];

describe('fitToContext', () => {
  it('leaves a prompt that fits untouched', async () => {
    const m = msgs([doc('a', 5)]);
    const r = await fitToContext(m, render, count, 1000);
    expect(r.trimmed).toBe(false);
    expect(r.messages).toBe(m);
  });
  it('drops the last documents first until the prompt fits', async () => {
    const m = msgs([doc('a', 80), doc('b', 80), doc('c', 80)]);
    const before = await count(render(m));
    const r = await fitToContext(m, render, count, Math.floor(before * 0.7));
    expect(r.trimmed).toBe(true);
    expect(r.tokens).toBeLessThanOrEqual(Math.floor(before * 0.7));
    const kept = JSON.parse(r.messages[3].content).result.documents.map((d: { id: string }) => d.id);
    expect(kept[0]).toBe('a'); // the best-ranked document stays
    expect(kept.length).toBeLessThan(3);
  });
  it('shortens a single long document when it is all that is left', async () => {
    const m = msgs([doc('a', 400)]);
    const r = await fitToContext(m, render, count, 300);
    expect(r.tokens).toBeLessThanOrEqual(300);
    expect(JSON.parse(r.messages[3].content).result.documents[0].text.endsWith('…')).toBe(true);
  });
  it('shortens a plain-text tool result too', async () => {
    const m: ChatMessage[] = [{ role: 'system', content: 's' }, { role: 'user', content: 'q' }, { role: 'tool', content: 'x'.repeat(3000) }];
    const r = await fitToContext(m, render, count, 400);
    expect(r.tokens).toBeLessThanOrEqual(400);
  });
  it('refuses, without touching the engine, when the prompt alone is too long', async () => {
    const m = msgs([doc('a', 5)], 'long system '.repeat(500));
    await expect(fitToContext(m, render, count, 300)).rejects.toBeInstanceOf(ContextOverflowError);
  });
});
