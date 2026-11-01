import { useCallback, useEffect, useRef, useState } from 'react';

// Feedback scurt de „se procesează” (implicit 500 ms) înainte de o acțiune instantanee, ca
// utilizatorul să vadă că biletul e verificat. Timerul se anulează dacă ecranul se închide.
export function useBriefLoading(durationMs = 500): [boolean, (action: () => void | Promise<void>) => void] {
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true);
  useEffect(() => () => {
    mounted.current = false;
    if (timer.current) clearTimeout(timer.current);
  }, []);
  const run = useCallback(
    (action: () => void | Promise<void>) => {
      setBusy(true);
      // An action that goes to the network keeps the loader up until it answers
      timer.current = setTimeout(() => {
        void Promise.resolve(action()).finally(() => {
          if (mounted.current) setBusy(false);
        });
      }, durationMs);
    },
    [durationMs],
  );
  return [busy, run];
}
