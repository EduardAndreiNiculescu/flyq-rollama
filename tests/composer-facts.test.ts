import { describe, expect, it } from 'vitest';
import { unsupportedFacts } from '../scripts/composer-facts';

describe('composed answer provenance', () => {
  const result = { flightNumber: 'RO311', gate: 'B4', duration: { text: '2h 25min' }, facts: 'scheduled arrival: 2026-10-31T14:10:00+01:00' };

  it('accepts codes, times, dates and reformatted durations copied from a tool result', () => {
    expect(unsupportedFacts('RO311, poarta B4, 14:10 pe 31.10; 2 ore și 25 de minute.', result)).toEqual([]);
  });

  it.each([
    ['RO312', 'RO312'],
    ['poarta C7', 'C7'],
    ['ora 15:40', '15'],
    ['30 de minute', '30'],
  ])('rejects an invented fact in %s', (answer, missing) => {
    expect(unsupportedFacts(answer, result)).toContain(missing);
  });
});
