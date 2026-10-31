import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { needsClarification } from '../src/core/clarify';
import { detectLang } from '../src/core/prompt';
import { retrieve } from '../src/core/knowledge';
import { routeIntents } from '../src/core/router';
import type { Intent } from '../src/core/types';

const gen: Intent[] = [{ intent: 'GENERAL_QUESTION', args: {} }];
const run = (question: string, o: { hasFlight?: boolean; hits?: number; corrections?: number; intents?: Intent[] } = {}) => {
  const lang = detectLang(question);
  return needsClarification({
    question,
    intents: o.intents ?? routeIntents(question),
    hasFlight: o.hasFlight ?? true,
    retrievalHitCount: o.hits ?? retrieve(question, lang, 3).length,
    corrections: o.corrections ?? 0,
    lang,
  });
};
const direct = (question: string, lang: 'ro' | 'en', intents: Intent[], extra: { hasFlight?: boolean; hits?: number } = {}) =>
  needsClarification({ question, intents, hasFlight: extra.hasFlight ?? true, retrievalHitCount: extra.hits ?? 0, corrections: 0, lang });

describe('no_flight', () => {
  it('RO: asks for flight number and date', () => {
    const r = run('La ce poartă este zborul meu?', { hasFlight: false });
    expect(r?.reason).toBe('no_flight');
    expect(r?.ask).toContain('zbor');
  });
  it('EN: asks for flight number and date', () => {
    const r = run('What time does my flight land?', { hasFlight: false });
    expect(r?.reason).toBe('no_flight');
    expect(r?.ask).toContain('flight number');
  });
  it('does not ask when a flight is known or typed in the question', () => {
    expect(run('What time does my flight land?', { hasFlight: true })).toBeNull();
    expect(run('La ce oră decolează zborul DEMO123?', { hasFlight: false })).toBeNull();
  });
  it('does not ask for knowledge questions or when another specific intent can be answered', () => {
    expect(run("Ce înseamnă 'delay' pe ecran?", { hasFlight: false })).toBeNull();
    expect(run('My flight is cancelled. Will I get compensation?', { hasFlight: false })).toBeNull();
    expect(run('My checked bag did not arrive. What do I do?', { hasFlight: false })).toBeNull();
  });
});

describe('no_destination', () => {
  const nav: Intent[] = [{ intent: 'OPEN_AIRPORT_MAP', args: {} }];
  it('RO', () => {
    const r = direct('Du-mă undeva', 'ro', nav);
    expect(r?.reason).toBe('no_destination');
    expect(r?.ask).toContain('Unde');
  });
  it('EN', () => {
    const r = direct('Take me somewhere', 'en', nav);
    expect(r?.reason).toBe('no_destination');
    expect(r?.ask).toContain('Where');
  });
  it('does not ask with a destination, or when the map itself is requested', () => {
    expect(run('Unde este toaleta?')).toBeNull();
    expect(run('Where is the nearest exit?')).toBeNull();
    expect(direct('Arată-mi harta', 'ro', nav)).toBeNull();
    expect(direct('Show me the map', 'en', nav)).toBeNull();
  });
});

describe('too_vague', () => {
  it('RO', () => {
    for (const q of ['ajutor', 'Ajutor!', 'asta', 'ceva']) {
      const r = direct(q, 'ro', gen);
      expect(r?.reason, q).toBe('too_vague');
    }
    expect(direct('ajutor', 'ro', gen)?.ask).toContain('ai nevoie');
  });
  it('EN', () => {
    for (const q of ['help', 'Help me', 'it', 'what']) {
      const r = direct(q, 'en', gen);
      expect(r?.reason, q).toBe('too_vague');
    }
    expect(direct('help', 'en', gen)?.ask).toContain('what you need');
  });
  it('treats garbled input with a at most two leftover words as vague, but not clear text', () => {
    expect(needsClarification({ question: 'xq zzv', intents: gen, hasFlight: true, retrievalHitCount: 0, corrections: 3, lang: 'en' })?.reason).toBe('too_vague');
    expect(direct('Can I bring a power bank?', 'en', gen, { hits: 0 })).toBeNull();
  });
  it('never asks when retrieval found something', () => {
    expect(direct('ajutor', 'ro', gen, { hits: 1 })).toBeNull();
  });
});

describe('never asks', () => {
  it.each(['Salut!', 'Bună ziua', 'Hello', 'hi', 'Mulțumesc!', 'Thanks', 'Thank you', 'ok', 'mersi', 'Good morning', 'Pa', 'Ce faci?', 'How are you'])(
    'greeting/thanks: %s',
    (q) => {
      expect(run(q, { hasFlight: false })).toBeNull();
      expect(direct(q, 'ro', gen)).toBeNull();
    },
  );
  it('clear intents and retrieval hits', () => {
    expect(run('Cât costă un taxi?', { hasFlight: false })).toBeNull();
    expect(run('How much baggage can I take?', { hasFlight: false })).toBeNull();
    expect(direct('lichide in bagajul de mana', 'ro', gen, { hits: 2 })).toBeNull();
  });
  it('returns at most one question with short wording', () => {
    for (const reason of ['no_flight', 'no_destination', 'too_vague'] as const) {
      const sample = {
        no_flight: run('Is my flight on time?', { hasFlight: false }),
        no_destination: direct('Take me somewhere', 'en', [{ intent: 'OPEN_AIRPORT_MAP', args: {} }]),
        too_vague: direct('help', 'en', gen),
      }[reason];
      expect(sample!.ask.split('?').length - 1).toBe(1);
      expect(sample!.ask.length).toBeLessThan(120);
    }
  });
});

describe('over-asking on the eval sets (hasFlight=true)', () => {
  const load = (f: string): { id: string; question: string }[] => JSON.parse(readFileSync(new URL(`../eval/${f}`, import.meta.url), 'utf8'));
  const all = [...load('questions.json'), ...load('tool-cases.json')];
  it('asks for none of the realistic questions when a flight is selected', () => {
    expect(all.length).toBe(101);
    const asked = all.filter((q) => run(q.question)).map((q) => q.id);
    expect(asked).toEqual([]);
  });
  it('without a flight, only genuine personal-flight questions (24 of 101) trigger no_flight', () => {
    const asked = all.map((q) => ({ id: q.id, r: run(q.question, { hasFlight: false }) })).filter((x) => x.r);
    expect(asked.every((x) => x.r!.reason === 'no_flight')).toBe(true);
    expect(asked.length).toBe(24);
    expect(asked.map((x) => x.id)).toEqual(
      expect.arrayContaining(['q14', 'q22', 't01', 't05', 't18', 't23']),
    );
    expect(asked.map((x) => x.id)).not.toEqual(expect.arrayContaining(['q06']));
  });
});
