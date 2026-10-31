import { useEffect, useState } from 'react';
import { clock } from '../services';

/** Ora curentă din ClockService, reîmprospătată periodic. */
export function useNow(intervalMs = 15_000): Date {
  const [now, setNow] = useState(() => clock.now());
  useEffect(() => {
    const id = setInterval(() => setNow(clock.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
