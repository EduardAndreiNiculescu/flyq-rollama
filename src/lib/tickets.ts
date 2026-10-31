import type { Flight, Ticket } from '../types';

const DAY_MS = 24 * 3600 * 1000;

/**
 * Biletul are un zbor „apropiat” dacă pleacă în următoarele 3 zile
 * (sau a plecat de cel mult 12 ore, ca să rămână vizibil în timpul zborului).
 */
export function isUpcoming(flight: Flight | null, now: Date): boolean {
  if (!flight) return false;
  const dep = Date.parse(flight.departureUtc);
  return dep - now.getTime() <= 3 * DAY_MS && now.getTime() - dep <= 12 * 3600 * 1000;
}

export function hasUpcomingTicket(tickets: Ticket[], getFlight: (id: string) => Flight | null, now: Date): boolean {
  return tickets.some(t => isUpcoming(getFlight(t.flightId), now));
}
