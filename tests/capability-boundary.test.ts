import { describe, expect, it } from 'vitest';
import { capabilityBoundary, capabilityBoundaryReply } from '../src/core/capability';
import { routeDecision } from '../src/core/router';

describe('capability boundary', () => {
  it.each([
    'Fă-mi check-in pentru zbor', 'Rezervă-mi un taxi la terminal',
    'Care este parola de Wi-Fi?', 'Cumpără-mi un bilet spre Roma',
    'Anulează rezervarea mea', 'Vreau un upgrade la business class',
  ])('blocks unsupported action: %s', question => {
    expect(capabilityBoundary(question)).toBe('unsupported-capability');
    expect(routeDecision(question).candidates).toEqual([]);
  });

  it('does not reject a factual check-in/document question', () => {
    const question = 'Is a screenshot of my passport accepted at check-in?';
    expect(capabilityBoundary(question)).toBeNull();
    expect(routeDecision(question).candidates.map(c => c.tool)).toEqual(['search_knowledge']);
  });

  it.each(['Spune-mi un banc, sunt deja în aeroport', 'Care este vremea la mare?'])('keeps chitchat out of the tool surface: %s', question => {
    expect(capabilityBoundary(question)).toBe('out-of-scope');
  });

  it('does not block supported questions and answers in the query language', () => {
    expect(capabilityBoundary('Care este poarta zborului meu?')).toBeNull();
    expect(capabilityBoundary('Can I take a powerbank in my cabin bag?')).toBeNull();
    expect(capabilityBoundaryReply('Can you book a taxi?')).toMatch(/^I can.t perform/);
  });
});
