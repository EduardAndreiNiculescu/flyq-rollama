import flightsJson from '../../data/flights.json';
import { haversineKm, interpolateGreatCircle } from '../../lib/geo';
import type { Airport, Flight, FlightPosition, Landmark } from '../../types';
import type { FlightTrackerService, Unsubscribe } from '../types';

const data = flightsJson as { airports: Airport[]; landmarks: Landmark[] };

// Zborul de 3 h 10 min trece în ~4 minute reale, ca să se vadă tot traseul în demo.
const SPEEDUP = 45;
const TICK_MS = 500;
const CLIMB_MIN = 20;
const DESCENT_MIN = 25;
// Primele secunde nu există fix GPS: afișăm estimarea din orar, ca în realitate lângă culoar
const GPS_FIX_AFTER_MS = 14_000;
const LANDMARK_RADIUS_KM = 180;

export class MockFlightTrackerService implements FlightTrackerService {
  private flight: Flight | null = null;
  private startedAt = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private listeners = new Set<(p: FlightPosition) => void>();
  private forcedSource: 'gps' | 'estimate' | null = null;

  debug = {
    setSource: (source: 'gps' | 'estimate') => {
      this.forcedSource = source;
    },
  };

  start(flight: Flight): void {
    this.stop();
    this.flight = flight;
    this.startedAt = Date.now();
    this.forcedSource = null;
    this.timer = setInterval(() => this.tick(), TICK_MS);
    this.tick();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  subscribe(cb: (position: FlightPosition) => void): Unsubscribe {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private tick() {
    const flight = this.flight;
    if (!flight) return;
    const from = data.airports.find(a => a.code === flight.from)!;
    const to = data.airports.find(a => a.code === flight.to)!;

    const totalMin = (Date.parse(flight.arrivalUtc) - Date.parse(flight.departureUtc)) / 60_000;
    const elapsedRealMs = Date.now() - this.startedAt;
    const elapsedMin = Math.min(totalMin, (elapsedRealMs * SPEEDUP) / 60_000);
    const progress = elapsedMin / totalMin;
    const totalKm = haversineKm(from, to);

    let altitudeM: number;
    let groundSpeedKmh: number;
    if (elapsedMin < CLIMB_MIN) {
      const t = elapsedMin / CLIMB_MIN;
      altitudeM = flight.cruiseAltitudeM * Math.sin((t * Math.PI) / 2);
      groundSpeedKmh = 280 + (flight.cruiseSpeedKmh - 280) * t;
    } else if (elapsedMin > totalMin - DESCENT_MIN) {
      const t = (totalMin - elapsedMin) / DESCENT_MIN;
      altitudeM = flight.cruiseAltitudeM * t;
      groundSpeedKmh = 260 + (flight.cruiseSpeedKmh - 260) * t;
    } else {
      // Mici variații, ca cifrele să nu pară înghețate
      const wobble = Math.sin(elapsedMin / 7);
      altitudeM = flight.cruiseAltitudeM + wobble * 15;
      groundSpeedKmh = flight.cruiseSpeedKmh + wobble * 6;
    }

    // Distanța parcursă urmează timpul, cu urcarea și coborârea mai lente decât croaziera
    const distanceProgress = Math.min(1, Math.max(0, progress));
    const here = interpolateGreatCircle(from, to, distanceProgress);
    const source = this.forcedSource ?? (elapsedRealMs >= GPS_FIX_AFTER_MS ? 'gps' : 'estimate');

    const nearest = data.landmarks
      .map(l => ({ l, d: haversineKm(here, l) }))
      .filter(x => x.d < LANDMARK_RADIUS_KM)
      .sort((a, b) => a.d - b.d)[0];

    const position: FlightPosition = {
      lat: here.lat,
      lon: here.lon,
      altitudeM: Math.max(0, altitudeM),
      groundSpeedKmh: Math.max(0, groundSpeedKmh),
      distanceRemainingKm: totalKm * (1 - distanceProgress),
      timeRemainingMin: Math.max(0, totalMin - elapsedMin),
      progress: distanceProgress,
      source,
      accuracyM: source === 'gps' ? 15 : 2400,
      nearestLandmarkId: nearest?.l.id,
    };
    this.listeners.forEach(cb => cb(position));
    if (progress >= 1) this.stop();
  }
}
