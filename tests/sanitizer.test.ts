import { describe, expect, it } from 'vitest';
import { extractFlightNumber, isConfirmedMapDestination, isProceduralKnowledgeQuery, sanitizeToolCall } from '../src/tools/sanitizer';

describe('extractFlightNumber', () => {
  it.each([
    ['Is DEMO507 on time?', 'DEMO507'],
    ['care e poarta pentru ro123?', 'RO123'],
    ['When does W6 1234 depart?', 'W61234'],
    ['unde este zborul AF1520?', 'AF1520'],
    ['status for kl1375 please', 'KL1375'],
    ['zborul XY7437 a aterizat?', 'XY7437'],
    ['informatii despre TAR 201', 'TAR201'],
    ['zborul meu DEMO 123 intarzie?', 'DEMO123'],
  ])('extracts from %s -> %s', (question, expected) => {
    expect(extractFlightNumber(question)).toBe(expected);
  });

  it('rejects gates, non-flight codes, and numbers without flight prefix', () => {
    expect(extractFlightNumber('Where is gate B12?')).toBeNull();
    expect(extractFlightNumber('Am nevoie de un cablu USB')).toBeNull();
    expect(extractFlightNumber('Care este parola de WiFi?')).toBeNull();
    expect(extractFlightNumber('Reguli COVID19')).toBeNull();
    expect(extractFlightNumber('Cat costa 50 EUR?')).toBeNull();
    expect(extractFlightNumber('Cat mai avem pana la aterizare?')).toBeNull();
  });
});

describe('sanitizeToolCall - flight number sanitation', () => {
  it('overwrites mutated flight number with the raw extracted number (RO/EN)', () => {
    // Romanian mismatch
    const resRo = sanitizeToolCall(
      'get_gate',
      { flightNumber: 'DEMO510' },
      'Ai poarta pentru DEMO507?'
    );
    expect(resRo.arguments.flightNumber).toBe('DEMO507');
    expect(resRo.sanitized).toBe(true);

    // English mismatch
    const resEn = sanitizeToolCall(
      'get_flight_details',
      { flightNumber: 'RO999' },
      'What is the delay on RO123?'
    );
    expect(resEn.arguments.flightNumber).toBe('RO123');
    expect(resEn.sanitized).toBe(true);
  });

  it('does not invent a flight number if passenger message has none', () => {
    const res = sanitizeToolCall(
      'get_flight_details',
      { flightNumber: 'LH450' }, // Model hallucinated LH450
      'Cat dureaza zborul?'
    );
    expect(res.arguments.flightNumber).toBeUndefined();
    expect(res.sanitized).toBe(true);
  });

  it('preserves context flight number if passenger selected one and model matches it', () => {
    const res = sanitizeToolCall(
      'get_gate',
      { flightNumber: 'DEMO123' },
      'La ce poarta trebuie sa merg?',
      { flightNumber: 'DEMO123' }
    );
    expect(res.arguments.flightNumber).toBe('DEMO123');
  });
});

describe('sanitizeToolCall - knowledge query preservation', () => {
  it('overwrites model rewritten query with the raw passenger question', () => {
    const rawQuestion = 'Cat costa bagajul in plus?';
    const modelRewritten = 'Cat costa bagajul în plus?';
    const res = sanitizeToolCall('search_knowledge', { query: modelRewritten }, rawQuestion);
    expect(res.arguments.query).toBe(rawQuestion);
    expect(res.sanitized).toBe(true);
  });

  it('bounds long passenger query to 200 characters', () => {
    const longQuestion = 'a'.repeat(300);
    const res = sanitizeToolCall('search_knowledge', { query: 'something' }, longQuestion);
    expect(res.arguments.query.length).toBe(200);
  });
});

describe('sanitizeToolCall - map vs procedural rules', () => {
  it('redirects procedural rules about prayer room to search_knowledge', () => {
    const res = sanitizeToolCall(
      'open_airport_map',
      { destination: 'camera de rugăciune' },
      'exista o camera de rugaciunee repede'
    );
    expect(res.name).toBe('search_knowledge');
    expect(res.arguments.query).toBe('exista o camera de rugaciunee repede');
    expect(res.sanitized).toBe(true);
    expect(res.action).toBe('execute');
  });

  it('clarifies an unconfirmed or hallucinated map destination', () => {
    const res = sanitizeToolCall(
      'open_airport_map',
      { destination: 'oficiul poților' }, // Typo / hallucination
      'pe unde ajung la ceva'
    );
    expect(res.action).toBe('clarify');
  });

  it('allows confirmed airport map destinations', () => {
    const res = sanitizeToolCall(
      'open_airport_map',
      { destination: 'toaleta' },
      'Unde este baia?'
    );
    expect(res.action).toBe('execute');
    expect(res.name).toBe('open_airport_map');
    expect(res.arguments.destination).toBe('toaleta');
  });
});
