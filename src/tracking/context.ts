import type { TrackingResult } from './result';
import type { EtaResult } from './eta';

/** Text block for the LLM prompt. Facts only; the model never sees URLs, tokens or credentials. */
export function trackingFacts(t: TrackingResult | null, eta: EtaResult | null, nowSec: number): string {
  if (!t) return 'live tracking: NOT AVAILABLE (offline or no tracking data)';
  if (t.kind === 'unavailable' && t.reason === 'flight_completed') return 'live tracking: NOT AVAILABLE (the provider reports this flight as landed, so there is no live position; this is third-party data, not an official statement)';
  if (t.kind === 'unavailable') return `live tracking: NOT AVAILABLE (${t.reason}); do not infer delay, cancellation or landing from this`;
  const o = t.observation;
  const age = o.observedAtSec === null ? null : Math.max(0, nowSec - o.observedAtSec);
  const lines = [
    `live tracking source: ${o.provider === 'airlabs' ? 'AirLabs' : 'OpenSky'} (aircraft position observation, not an official flight status)`,
    `identity match: ${t.identity.status}`,
    `position observed ${age === null ? 'at an unknown time' : `${Math.round(age / 60)} min ago`}: ${o.lat ?? 'unknown'}, ${o.lon ?? 'unknown'}`,
    `on ground: ${o.onGround}`,
  ];
  if (eta?.kind === 'estimate') {
    lines.push(
      `ETA near the airport: about ${Math.round(eta.seconds / 60)} min (ESTIMATE, uncalibrated model, may change; not the landing time)`,
    );
  } else {
    lines.push(`ETA: NOT AVAILABLE${eta ? ` (${eta.reason})` : ''}`);
  }
  return lines.join('\n');
}
