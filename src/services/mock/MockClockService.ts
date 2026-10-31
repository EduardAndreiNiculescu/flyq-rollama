import type { ClockService } from '../types';

// Ceasul demo pornește la 08:22 ora Craiovei, în ziua zborului demo, și merge în timp real.
const DEMO_START_UTC = Date.parse('2026-10-31T06:22:00Z');

export class MockClockService implements ClockService {
  private startedAt = Date.now();
  private offsetMs = 0;

  now(): Date {
    return new Date(DEMO_START_UTC + (Date.now() - this.startedAt) + this.offsetMs);
  }

  advance(minutes: number): void {
    this.offsetMs += minutes * 60_000;
  }

  reset(): void {
    this.startedAt = Date.now();
    this.offsetMs = 0;
  }
}
