import { describe, expect, it } from 'vitest';
import { routeIntents } from '../src/core/router';
import { flightQuestionType } from '../src/core/templates';

/** Paraphrase groups: every member must route to the same intent (and, for flight questions, the same exact question type). */
const GROUPS: Array<{ name: string; intent: string; type?: string | null; phrases: string[] }> = [
  {
    name: 'gate',
    intent: 'GET_FLIGHT_DETAILS',
    type: 'gate',
    phrases: ['La ce poartă este zborul meu?', 'Care e poarta mea?', 'Spune-mi poarta', 'Which gate is my flight?', 'What gate is my flight at?', 'Tell me my gate', 'Și poarta?', 'and the gate?'],
  },
  {
    name: 'arrival',
    intent: 'GET_FLIGHT_DETAILS',
    type: 'arrival',
    phrases: ['Când aterizează zborul meu?', 'La ce oră ajunge avionul?', 'When does my flight land?', 'What time does my flight arrive?', 'Dar când aterizează?'],
  },
  {
    name: 'departure',
    intent: 'GET_FLIGHT_DETAILS',
    type: 'departure',
    phrases: ['Când decolează zborul meu?', 'La ce oră pleacă avionul?', 'When does my flight take off?', 'What time does my flight depart?'],
  },
  {
    name: 'status',
    intent: 'GET_FLIGHT_DETAILS',
    type: 'status',
    phrases: ['Zborul meu e întârziat?', 'Este anulat zborul meu?', 'Is my flight delayed?', 'Is my flight cancelled?', 'is it delayed?'],
  },
  {
    name: 'remaining',
    intent: 'GET_FLIGHT_TIME_REMAINING',
    type: 'remaining',
    phrases: ['Cât mai e până aterizăm?', 'În cât timp ajungem?', 'How much time is left until we land?', 'How long until we arrive?'],
  },
];

/** Transformations that must NOT change the meaning. */
const TRANSFORMS: Array<[string, (s: string) => string]> = [
  ['uppercase', (s) => s.toUpperCase()],
  ['lowercase', (s) => s.toLowerCase()],
  ['extra spaces', (s) => `  ${s.replace(/ /g, '  ')}  `],
  ['no diacritics', (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '')],
  ['no punctuation', (s) => s.replace(/[?!.,]/g, '')],
  ['trailing ellipsis', (s) => `${s.replace(/\?$/, '')}...`],
];

describe('router: paraphrases agree', () => {
  for (const g of GROUPS) {
    for (const p of g.phrases) {
      it(`${g.name}: "${p}"`, () => {
        const intents = routeIntents(p);
        expect(intents.map((i) => i.intent)).toContain(g.intent);
        if (g.type !== undefined) expect(flightQuestionType(p)).toBe(g.type);
      });
    }
  }
});

describe('router: meaning-preserving transformations keep the intent', () => {
  for (const g of GROUPS) {
    for (const [tname, tf] of TRANSFORMS) {
      it(`${g.name} / ${tname}`, () => {
        for (const p of g.phrases) {
          const base = routeIntents(p)[0].intent;
          const out = routeIntents(tf(p))[0].intent;
          expect(out, `"${tf(p)}" (from "${p}")`).toBe(base);
        }
      });
    }
  }
});

describe('router: unrelated chatter stays unrouted to flight data', () => {
  for (const q of ['Salut!', 'Hello there', 'Mulțumesc', 'Thank you very much', 'Ce faci?', 'Cum e vremea?']) {
    it(`"${q}"`, () => {
      expect(routeIntents(q).map((i) => i.intent)).not.toContain('GET_FLIGHT_DETAILS');
    });
  }
});
