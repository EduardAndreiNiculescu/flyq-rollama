import { describe, it, expect } from 'vitest';
import { bearingDeg, haversineKm, interpolateGreatCircle } from '../../src/lib/geo';

const CRA = { lat: 44.3181, lon: 23.8886 };
const LTN = { lat: 51.8747, lon: -0.3683 };

describe('geo', () => {
  it('distanța Craiova → Luton e în jur de 1 975 km', () => {
    expect(haversineKm(CRA, LTN)).toBeGreaterThan(1940);
    expect(haversineKm(CRA, LTN)).toBeLessThan(2010);
  });

  it('interpolarea pornește și se termină în aeroporturi', () => {
    const start = interpolateGreatCircle(CRA, LTN, 0);
    const end = interpolateGreatCircle(CRA, LTN, 1);
    expect(start.lat).toBeCloseTo(CRA.lat, 5);
    expect(end.lon).toBeCloseTo(LTN.lon, 5);
  });

  it('jumătatea drumului e la jumătatea distanței', () => {
    const mid = interpolateGreatCircle(CRA, LTN, 0.5);
    expect(haversineKm(CRA, mid)).toBeCloseTo(haversineKm(mid, LTN), 0);
  });

  it('de la Craiova spre Luton se zboară spre nord-vest', () => {
    const bearing = bearingDeg(CRA, LTN);
    expect(bearing).toBeGreaterThan(280);
    expect(bearing).toBeLessThan(320);
  });
});
