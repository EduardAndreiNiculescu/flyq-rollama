import type { FlightRecord } from '../../src/core/types';
import { parseAirLabsFlight } from '../../src/tracking/airlabs';
import type { TrackingResult } from '../../src/tracking/result';
import type { FlightLookup, LiveProvider } from './providers';

/** Local-only fictional flight for inspecting V4 without an AirLabs key. */
export class DemoFlightProvider implements LiveProvider {
  stats = { upstreamCalls: 0, cacheHits: 0 };

  async lookup(flightNumber: string): Promise<FlightLookup> {
    if (flightNumber.replace(/\s/g, '').toUpperCase() !== 'FF123') return { ok: false, reason: 'not_found' };
    const now = Date.now();
    const departure = new Date(now + 90 * 60_000).toISOString();
    const arrival = new Date(now + 3 * 60 * 60_000).toISOString();
    const record: FlightRecord = {
      flightNumber: 'FF123', departureAirport: 'CRA', arrivalAirport: 'BGY',
      scheduledDeparture: departure, scheduledArrival: arrival,
      gate: 'B4', gateStatus: 'confirmed', dataSource: 'demo', lastUpdated: null,
      providerStatus: 'scheduled',
    };
    const flight = parseAirLabsFlight({ response: {
      flight_iata: 'FF123', dep_iata: 'CRA', arr_iata: 'BGY', dep_gate: 'B4',
      dep_time_utc: departure.slice(0, 16).replace('T', ' '),
      arr_time_utc: arrival.slice(0, 16).replace('T', ' '), status: 'scheduled',
    } });
    return { ok: true, flight, record };
  }

  async tracking(): Promise<TrackingResult> {
    return { kind: 'unavailable', schemaVersion: 1, reason: 'no_coverage', checkedAtSec: Math.floor(Date.now() / 1000) };
  }
}
