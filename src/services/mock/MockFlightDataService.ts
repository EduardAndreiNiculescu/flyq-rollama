import flightsJson from '../../data/flights.json';
import { julianToDate } from '../../lib/bcbp';
import type { Airport, BoardingPass, Flight, Landmark } from '../../types';
import type { FlightDataService } from '../types';

const data = flightsJson as { airports: Airport[]; flights: Flight[]; landmarks: Landmark[] };

export class MockFlightDataService implements FlightDataService {
  findFlight(pass: BoardingPass, now: Date): Flight | null {
    const date = julianToDate(pass.julianDate, now).toISOString().slice(0, 10);
    return (
      data.flights.find(
        f =>
          f.carrier === pass.carrier &&
          f.flightNumber === pass.flightNumber &&
          f.from === pass.from &&
          f.to === pass.to &&
          f.departureUtc.startsWith(date),
      ) ?? null
    );
  }

  getFlight(id: string): Flight | null {
    return data.flights.find(f => f.id === id) ?? null;
  }

  getAirport(code: string): Airport | null {
    return data.airports.find(a => a.code === code) ?? null;
  }

  getLandmarks(): Landmark[] {
    return data.landmarks;
  }
}
