import type { Flight, FlightPosition } from '../../types';
import type { FlightTrackerService, Unsubscribe } from '../types';
import { fetchFlight } from './gatewayClient';
import { getLiveEntry } from './liveFlights';
import { positionFromSchedule, positionFromTracking } from './livePosition';

const POLL_MS = 15_000; // the gateway caches per flight for 60 s, so polling faster only burns the call budget

/** Follows a real aircraft through the gateway. Without a fix it shows the schedule estimate and says so ('estimate'). */
export class LiveFlightTrackerService implements FlightTrackerService {
  private timer: ReturnType<typeof setInterval> | null = null;
  private listeners = new Set<(p: FlightPosition) => void>();
  private flight: Flight | null = null;
  private forced: 'gps' | 'estimate' | null = null;

  debug = { setSource: (s: 'gps' | 'estimate') => void (this.forced = s) };

  start(flight: Flight): void {
    this.stop();
    this.flight = flight;
    this.forced = null;
    void this.poll();
    this.timer = setInterval(() => void this.poll(), POLL_MS);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  subscribe(cb: (position: FlightPosition) => void): Unsubscribe {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private async poll() {
    const flight = this.flight;
    const entry = flight ? getLiveEntry(flight.id) : null;
    if (!flight || !entry) return;
    let position: FlightPosition;
    try {
      const { tracking } = await fetchFlight(entry.record.flightNumber);
      position = positionFromTracking(tracking, entry, Date.now());
    } catch {
      position = positionFromSchedule(entry, Date.now());
    }
    if (this.flight !== flight) return; // stopped or switched while the request was in flight
    if (this.forced) position = { ...position, source: this.forced };
    this.listeners.forEach(cb => cb(position));
    if (position.progress >= 1) this.stop();
  }
}
