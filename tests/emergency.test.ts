import { describe, expect, it } from 'vitest';
import { isEmergencyRelated, urgentSafetyAnswer } from '../src/core/emergency';
import { runToolLoop } from '../src/tools/loop';
import type { LlmEngine } from '../src/core/assistant';

describe('immediate emergency help', () => {
  it.each([
    ['Am nevoie de ambulanță!', 'ro'],
    ['E o urgență.', 'ro'],
    ['Nu pot respira.', 'ro'],
    ['Ajută-mă!', 'ro'],
    ['Am nevoie de ajutor urgent.', 'ro'],
    ['Mama a leșinat!', 'ro'],
    ['I need an ambulance now.', 'en'],
    ['Call the ambulance!', 'en'],
    ['Help me!', 'en'],
    ['I can’t breathe.', 'en'],
    ['My child is unconscious.', 'en'],
    ["It's an emergency!", 'en'],
    ["I can't breathe.", 'en'],
  ] as const)('answers %s immediately in %s', (question, lang) => {
    const answer = urgentSafetyAnswer(question);
    expect(answer).toContain('112');
    expect(answer).toContain(lang === 'ro' ? 'angajat' : 'airport staff');
  });

  it.each([
    'Unde este ieșirea de urgență?',
    'What is the emergency exit route?',
    'Nu am nevoie de ambulanță.',
    'Nu am nevoie de ajutor urgent.',
    'Nu a leșinat.',
    "Don't call an ambulance.",
    "It's not an emergency.",
    'What are the rules for medical luggage?',
  ])('leaves %s to the normal assistant', question => {
    expect(urgentSafetyAnswer(question)).toBeNull();
  });

  it('recognizes an informational emergency-number question without forcing the shortcut', () => {
    expect(isEmergencyRelated('What is the emergency number?')).toBe(true);
    expect(urgentSafetyAnswer('What is the emergency number?')).toBeNull();
    expect(isEmergencyRelated('What are the rules for medical luggage?')).toBe(false);
  });

  it('answers before any model or tool call, even when flight fast path is disabled', async () => {
    let modelCalls = 0;
    const engine: LlmEngine = {
      async generate() {
        modelCalls++;
        throw new Error('model should not run');
      },
      async stop() {},
    };
    const out = await runToolLoop(engine, [{ role: 'system', content: 'You are FlightFlow.' }, { role: 'user', content: 'I need an ambulance now.' }], { now: () => new Date(), context: { connectionAvailable: false } }, () => {});
    expect(out.path).toBe('fast');
    expect(out.text).toContain('112');
    expect(out.trace).toEqual([]);
    expect(modelCalls).toBe(0);
  });
});
