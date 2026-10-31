import { describe, it, expect } from 'vitest';
import {
  BCBP_MANDATORY_LENGTH,
  DEMO_BCBP,
  julianToDate,
  maskPnr,
  normalizeFlightNumber,
  normalizeSeat,
  parseBcbp,
} from '../../src/lib/bcbp';

describe('parseBcbp', () => {
  it('codul demo are exact lungimea obligatorie', () => {
    expect(DEMO_BCBP).toHaveLength(BCBP_MANDATORY_LENGTH);
  });

  it('citește toate câmpurile obligatorii din biletul demo', () => {
    const result = parseBcbp(DEMO_BCBP);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.pass).toMatchObject({
      formatCode: 'M',
      legs: 1,
      passengerName: 'POPESCU/ANDREI',
      electronicTicket: true,
      pnr: 'K7XQ2M',
      from: 'CRA',
      to: 'LTN',
      carrier: 'W6',
      flightNumber: '3541',
      julianDate: 304,
      compartment: 'Y',
      seat: '14C',
      sequence: '0042',
      passengerStatus: '1',
    });
  });

  it('acceptă date suplimentare după primele 60 de caractere', () => {
    const result = parseBcbp(`${DEMO_BCBP}>5180WW6304BW6 0000000000000`);
    expect(result.ok).toBe(true);
  });

  it('ignoră finalul de linie copiat din e-mail', () => {
    expect(parseBcbp(`${DEMO_BCBP}\r\n`).ok).toBe(true);
  });

  it.each([
    ['prea scurt', DEMO_BCBP.slice(0, 59), 'tooShort'],
    ['format greșit', `S${DEMO_BCBP.slice(1)}`, 'badFormat'],
    ['număr de segmente invalid', `M0${DEMO_BCBP.slice(2)}`, 'badLegs'],
    ['aeroport invalid', `${DEMO_BCBP.slice(0, 30)}C1ALTN${DEMO_BCBP.slice(36)}`, 'badAirport'],
    ['dată invalidă', `${DEMO_BCBP.slice(0, 44)}400${DEMO_BCBP.slice(47)}`, 'badDate'],
    ['loc invalid', `${DEMO_BCBP.slice(0, 48)}????${DEMO_BCBP.slice(52)}`, 'badSeat'],
  ])('respinge codul cu %s', (_name, input, error) => {
    expect(parseBcbp(input)).toEqual({ ok: false, error });
  });
});

describe('normalizare', () => {
  it.each([
    ['014C', '14C'],
    ['001A', '1A'],
    ['123F', '123F'],
  ])('loc %s → %s', (raw, expected) => expect(normalizeSeat(raw)).toBe(expected));

  it.each([
    ['3541 ', '3541'],
    ['0123 ', '123'],
    ['0045A', '45A'],
  ])('zbor %s → %s', (raw, expected) => expect(normalizeFlightNumber(raw)).toBe(expected));

  it('maschează PNR-ul', () => {
    expect(maskPnr('K7XQ2M')).toBe('K7••2M');
    expect(maskPnr('ABC')).toBe('•••');
  });
});

describe('julianToDate', () => {
  it('ziua 304 din 2026 e 31 octombrie', () => {
    const date = julianToDate(304, new Date('2026-10-29T08:00:00Z'));
    expect(date.toISOString().slice(0, 10)).toBe('2026-10-31');
  });

  it('trece în anul următor pentru zboruri din ianuarie adăugate în decembrie', () => {
    const date = julianToDate(10, new Date('2026-12-20T08:00:00Z'));
    expect(date.toISOString().slice(0, 10)).toBe('2027-01-10');
  });
});
