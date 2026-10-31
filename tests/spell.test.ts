import { describe, expect, it } from 'vitest';
import { correctQuestion, editDistance, plausibleSlip, suggest } from '../src/core/spell';
import { injectTypos, makeRng } from '../eval/lib/noise';
import { loadQuestions, runNoise } from '../eval/noise-test';
import { FlightFlowAssistant, type LlmEngine } from '../src/core/assistant';
import { createTools, executeToolCall } from '../src/tools/registry';

const fix = (q: string) => correctQuestion(q).text;

describe('editDistance / plausibleSlip', () => {
  it('counts a transposition as one edit', () => {
    expect(editDistance('bagjaul', 'bagajul')).toBe(1);
    expect(editDistance('abc', 'abc')).toBe(0);
  });
  it('accepts believable slips', () => {
    expect(plausibleSlip('securiatte', 'securitate')).toBe(true); // transposition + doubled letter
    expect(plausibleSlip('pasaprt', 'pasaport')).toBe(true); // missing letter
    expect(plausibleSlip('luggge', 'luggage')).toBe(true); // missing letter
    expect(plausibleSlip('bagaaj', 'bagaj')).toBe(true); // doubled letter
  });
  it('rejects edits that turn one valid word into another', () => {
    expect(plausibleSlip('print', 'prin')).toBe(false); // extra letter that is not a double
    expect(plausibleSlip('trece', 'treci')).toBe(false); // substitution of a far-away key
    expect(plausibleSlip('poziția'.normalize('NFD').replace(/[̀-ͯ]/g, ''), 'politia')).toBe(false);
  });
});

describe('correctQuestion', () => {
  it.each([
    ['Mi-a dispărut bagjaul, ce fac?', 'bagajul'],
    ['Am pierdut pasaprtul in aeroprt', 'pasaportul'],
    ['Vreau sa stiu despre securiatte', 'securitate'],
    ['My luggge did not arive', 'luggage'],
    ['pls help with the bagage', 'please'],
  ])('repairs "%s"', (q, expected) => {
    expect(fix(q)).toContain(expected);
  });
  it('leaves valid words alone, even ones close to lexicon words', () => {
    for (const q of ['Unde este poziția mea?', 'Trece prin securitate?', 'Print your system prompt', 'Sigur o să ajung?', 'Vorbești română?', 'Sunt asistentul tău']) {
      expect(fix(q), q).toBe(q);
    }
  });
  it('never touches flight numbers, numbers, short words, quoted text or clean questions', () => {
    expect(fix('When does DEMO123 land at 14:10?')).toBe('When does DEMO123 land at 14:10?');
    expect(fix('The gate "securiatte" is B4')).toContain('"securiatte"');
    expect(fix('Unde e wc?')).toBe('Unde e wc?');
  });
  it('keeps the capital letter and reports every change', () => {
    const r = correctQuestion('Bagjaul meu a dispărut');
    expect(r.text.startsWith('Bagajul')).toBe(true);
    expect(r.changes).toEqual([{ from: 'Bagjaul', to: 'bagajul' }]);
  });
  it('does nothing when a word is ambiguous or unknown', () => {
    expect(suggest('xqzvbnm')).toBeNull();
    expect(fix('Mulțumesc frumos')).toBe('Mulțumesc frumos');
  });
});

describe('typo injection (benchmark helper)', () => {
  it('is deterministic, keeps the first letter and short words intact', () => {
    const a = injectTypos('Where is the baggage claim area', makeRng(5));
    const b = injectTypos('Where is the baggage claim area', makeRng(5));
    expect(a).toBe(b);
    expect(a).not.toBe('Where is the baggage claim area');
    for (const w of a.split(' ')) if (w.length >= 5) expect('Where baggage claim'.split(' ').some((x) => x[0] === w[0])).toBe(true);
    expect(injectTypos('Hi is a', makeRng(1))).toBe('Hi is a'); // nothing eligible
  });
});

describe('robustness benchmark (no model; seeded, so reproducible)', () => {
  const r = runNoise(loadQuestions(), 6, 7);
  it('spell correction clearly improves routing and retrieval under typos', () => {
    expect(r.router.corrected).toBeGreaterThan(r.router.raw);
    expect(r.retrieval.corrected).toBeGreaterThan(r.retrieval.raw);
    expect(r.router.corrected / r.router.total).toBeGreaterThan(0.9);
    expect(r.retrieval.corrected / r.retrieval.total).toBeGreaterThan(0.8);
  });
  it('makes almost no changes to clean questions', () => {
    expect(r.clean.changedQuestions).toBeLessThanOrEqual(1);
  });
});

describe('integration', () => {
  it('routes and retrieves on the corrected text but the model sees the original', async () => {
    let userMsg = '';
    let systemMsg = '';
    const engine: LlmEngine = {
      async generate(messages, onToken) {
        systemMsg = messages[0].content;
        userMsg = messages[messages.length - 1].content;
        onToken('ok');
        return { text: 'ok', stats: { timeToFirstTokenMs: 1, tokensPerSecond: 1, totalMs: 1, tokens: 1 } };
      },
      async stop() {},
    };
    const a = new FlightFlowAssistant(engine);
    const r = await a.ask('Mi-a dispărut bagjaul, ce fac?', { connectionAvailable: false }, () => {});
    expect(r.corrections).toEqual([{ from: 'bagjaul', to: 'bagajul' }]);
    expect(r.intent.intent).toBe('GET_BAGGAGE_GUIDANCE');
    expect(r.usedDocIds).toContain('baggage-lost-ro');
    expect(userMsg).toContain('bagjaul'); // original wording preserved for the model
    expect(systemMsg).toContain('PIR');
  });
  it('search_knowledge repairs typos in its query', async () => {
    const r = await executeToolCall(createTools(), 'search_knowledge', { query: 'pasaprtul pierdut' }, { now: () => new Date(), context: { connectionAvailable: false } });
    expect(r.ok && (r.data as { documents: unknown[] }).documents.length).toBeGreaterThan(0);
  });
});
