import { describe, expect, it } from 'vitest';
import { cleanFlightNumber, flightNumberCandidates, parseFlightNumber } from '../src/lib/flightNumber';

describe('flight number formats', () => {
  it('cleans spaces, dashes and case', () => {
    expect(cleanFlightNumber(' w6-3541 ')).toBe('W63541');
  });
  it('turns the Skyscanner-style ICAO number into the spellings the server may know', () => {
    expect(flightNumberCandidates('GFA006')).toEqual(['GFA006', 'GFA6', 'GF6', 'GF006']);
  });
  it('tries the ICAO code for an IATA number and the other way round', () => {
    expect(flightNumberCandidates('w6 3541')).toEqual(['W63541', 'WZZ3541']);
    expect(flightNumberCandidates('WZZ3101')).toEqual(['WZZ3101', 'W63101']);
  });
  it('keeps a trailing letter and strips only leading zeros', () => {
    expect(flightNumberCandidates('RO0311A')).toEqual(['RO0311A', 'RO311A', 'ROT0311A']);
    expect(flightNumberCandidates('FR1010')).toEqual(['FR1010', 'RYR1010']);
  });
  it('tries an unknown airline only as typed and without zeros', () => {
    expect(flightNumberCandidates('XQ0042')).toEqual(['XQ0042', 'XQ42']);
  });
  it('rejects what is not a flight number', () => {
    expect(parseFlightNumber('hello')).toBeNull();
    expect(flightNumberCandidates('')).toEqual([]);
  });
});
