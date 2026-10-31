// Calcule pe sferă pentru trackerul de zbor (rută pe arc de cerc mare).
const EARTH_RADIUS_KM = 6371;
const toRad = (deg: number) => (deg * Math.PI) / 180;
const toDeg = (rad: number) => (rad * 180) / Math.PI;

export interface LatLon {
  lat: number;
  lon: number;
}

export function haversineKm(a: LatLon, b: LatLon): number {
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Punctul aflat la fracțiunea `t` (0..1) pe arcul de cerc mare dintre a și b. */
export function interpolateGreatCircle(a: LatLon, b: LatLon, t: number): LatLon {
  const φ1 = toRad(a.lat);
  const λ1 = toRad(a.lon);
  const φ2 = toRad(b.lat);
  const λ2 = toRad(b.lon);
  const δ = haversineKm(a, b) / EARTH_RADIUS_KM;
  if (δ === 0) return { ...a };
  const A = Math.sin((1 - t) * δ) / Math.sin(δ);
  const B = Math.sin(t * δ) / Math.sin(δ);
  const x = A * Math.cos(φ1) * Math.cos(λ1) + B * Math.cos(φ2) * Math.cos(λ2);
  const y = A * Math.cos(φ1) * Math.sin(λ1) + B * Math.cos(φ2) * Math.sin(λ2);
  const z = A * Math.sin(φ1) + B * Math.sin(φ2);
  return { lat: toDeg(Math.atan2(z, Math.hypot(x, y))), lon: toDeg(Math.atan2(y, x)) };
}

/** Direcția inițială de la a spre b, în grade (0 = nord, 90 = est). */
export function bearingDeg(a: LatLon, b: LatLon): number {
  const φ1 = toRad(a.lat);
  const φ2 = toRad(b.lat);
  const Δλ = toRad(b.lon - a.lon);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/** Proiecție echirectangulară simplă pentru harta schematică (suficientă pentru Europa). */
export function projectSchematic(
  p: LatLon,
  bounds: { minLat: number; maxLat: number; minLon: number; maxLon: number },
  width: number,
  height: number,
): { x: number; y: number } {
  const midLat = toRad((bounds.minLat + bounds.maxLat) / 2);
  const spanX = (bounds.maxLon - bounds.minLon) * Math.cos(midLat);
  const spanY = bounds.maxLat - bounds.minLat;
  const scale = Math.min(width / spanX, height / spanY);
  const offsetX = (width - spanX * scale) / 2;
  const offsetY = (height - spanY * scale) / 2;
  return {
    x: offsetX + (p.lon - bounds.minLon) * Math.cos(midLat) * scale,
    y: offsetY + (bounds.maxLat - p.lat) * scale,
  };
}
