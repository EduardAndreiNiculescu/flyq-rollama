import { describe, expect, it } from 'vitest';
import { near, routeIntents } from '../src/core/router';

const names = (q: string) => routeIntents(q).map((i) => i.intent);
const first = (q: string) => routeIntents(q)[0];

describe('near (typo tolerance)', () => {
  it('matches typos and inflections', () => {
    expect(near('baia', 'baie')).toBe(true);
    expect(near('une', 'unde')).toBe(true);
    expect(near('wher', 'where')).toBe(true);
    expect(near('bathrom', 'bathroom')).toBe(true);
    expect(near('aterizam', 'ateriz')).toBe(true);
  });
  it('does not confuse different words', () => {
    expect(near('date', '=gate')).toBe(false);
    expect(near('data', 'dureaz')).toBe(false);
    expect(near('gata', '=gate')).toBe(false);
  });
});

describe('real questions that the old router missed', () => {
  it('"Une este baia n aeroport" opens the map to the toilet', () => {
    expect(first('Une este baia n aeroport')).toEqual({ intent: 'OPEN_AIRPORT_MAP', args: { destination: 'toaleta' } });
  });
  it('"Cand imi ajunge avionul ?" is flight data, not a KB lookup', () => {
    expect(names('Cand imi ajunge avionul ?')).toEqual(['GET_FLIGHT_DETAILS']);
  });
});

describe('navigation', () => {
  it.each([
    ['Where is the toilet?', 'toilet'],
    ['wher is the bathrom', 'toilet'],
    ['Unde e toaleta', 'toaleta'],
    ['unde este iesirea', 'ieșirea'],
    ['How do I get to the exit?', 'exit'],
    ['Cum ajung la taxiuri?', 'taxiurile'],
    ['Unde pot manca?', 'restaurant sau cafenea'],
    ['Where is the information desk', 'information desk'],
  ])('%s -> map to %s', (q, dest) => {
    expect(first(q)).toEqual({ intent: 'OPEN_AIRPORT_MAP', args: { destination: dest } });
  });
  it('"where is my gate" is navigation, "which gate is my flight at" is flight data', () => {
    expect(first('Unde este poarta?').intent).toBe('OPEN_AIRPORT_MAP');
    expect(first('Where is my gate?').intent).toBe('OPEN_AIRPORT_MAP');
    expect(first('La ce poarta este zborul meu?').intent).toBe('GET_FLIGHT_DETAILS');
    expect(first('Which gate is my flight at?').intent).toBe('GET_FLIGHT_DETAILS');
  });
  it('unknown place after a strong trigger keeps the words, sanitized by normalization', () => {
    const i = first('Unde este salonul VIP?');
    expect(i.intent).toBe('OPEN_AIRPORT_MAP');
    expect(i.args.destination).toMatch(/^[a-z0-9 ]+$/);
  });
  it('markup in the question cannot reach the destination', () => {
    const i = first('Open map to <script>alert(1)</script>');
    expect(i.args.destination ?? '').toMatch(/^[a-z0-9 ]*$/);
  });
});

describe('flight', () => {
  it.each([
    ['La ce ora decoleaza zborul meu?', 'GET_FLIGHT_DETAILS'],
    ['When does DEMO123 depart?', 'GET_FLIGHT_DETAILS'],
    ['Cat dureaza zborul?', 'GET_FLIGHT_DETAILS'],
    ['Is my flight delayed?', 'GET_FLIGHT_DETAILS'],
    ['Zborul a fost anulat?', 'GET_FLIGHT_DETAILS'],
    ['Cat mai dureaza pana aterizam', 'GET_FLIGHT_TIME_REMAINING'],
    ['How long until DEMO123 lands?', 'GET_FLIGHT_TIME_REMAINING'],
    ['cat mai avem pana la sosire', 'GET_FLIGHT_TIME_REMAINING'],
  ])('%s -> %s', (q, intent) => {
    expect(first(q).intent).toBe(intent);
  });
  it('extracts the flight number', () => {
    expect(first('Is DEMO123 on time?').args).toEqual({ flightNumber: 'DEMO123' });
  });
  it('the word "date" or "data" does not trigger gate or flight handling', () => {
    expect(names('Ce date personale colectati?')).toEqual(['GENERAL_QUESTION']);
  });
});

describe('multi-intent and other topics', () => {
  it('"Unde e poarta si cat mai avem?" returns both, map first', () => {
    expect(names('Unde e poarta si cat mai avem pana aterizam?')).toEqual(['OPEN_AIRPORT_MAP', 'GET_FLIGHT_TIME_REMAINING']);
  });
  it.each([
    ['Mi-am pierdut valiza', 'GET_BAGGAGE_GUIDANCE'],
    ['valiza mea a disparut', 'GET_BAGGAGE_GUIDANCE'],
    ['Cat bagaj pot lua?', 'GET_BAGGAGE_GUIDANCE'],
    ['am uitat pasaportu acasa', 'GET_TRAVEL_DOCUMENT_GUIDANCE'],
    ['Do I need a visa?', 'GET_TRAVEL_DOCUMENT_GUIDANCE'],
    ['Ce inseamna boarding?', 'LOOKUP_AIRPORT_PROCEDURE'],
    ['Can I take liquids through security?', 'LOOKUP_AIRPORT_PROCEDURE'],
  ])('%s -> %s', (q, intent) => {
    expect(first(q).intent).toBe(intent);
  });
  it('out-of-scope questions fall back to GENERAL_QUESTION', () => {
    for (const q of ['best pizza recipe', 'Ce restaurante sunt deschise acum?', 'Care e numarul de telefon al aeroportului?', 'hello']) {
      expect(names(q)).toEqual(['GENERAL_QUESTION']);
    }
  });
});

describe('regressions found by running the router over eval/questions.json', () => {
  it('"buletinul" must not fuzzy-match "bufet" (documents question opened the map)', () => {
    expect(names('Am uitat buletinul acasa. Pot arata o poza?')).toEqual(['GET_TRAVEL_DOCUMENT_GUIDANCE']);
  });
  it('"where am I flying" / "where is my plane" are flight questions, not navigation', () => {
    expect(first('What is my flight number and where am I flying?').intent).toBe('GET_FLIGHT_DETAILS');
    expect(first('Where is my plane right now and at what altitude?').intent).toBe('GET_FLIGHT_DETAILS');
  });
  it('kilos in cabin is a baggage question', () => {
    expect(first('How many kilos can I take in cabin?').intent).toBe('GET_BAGGAGE_GUIDANCE');
  });
  it('"cat" (how much) is not the verb "caut"; "take" in "can I take liquids" is not navigation', () => {
    expect(names('Cat bagaj pot lua?')).toEqual(['GET_BAGGAGE_GUIDANCE']);
    expect(names('Can I take liquids through security?')).toEqual(['LOOKUP_AIRPORT_PROCEDURE']);
  });
  it('no regex in the router contains a control character', async () => {
    const src = (await import('node:fs')).readFileSync(new URL('../src/core/router.ts', import.meta.url), 'utf8');
    expect(src.includes(String.fromCharCode(8))).toBe(false);
  });
});
