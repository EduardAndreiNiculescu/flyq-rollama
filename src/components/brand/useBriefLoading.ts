import { useCallback, useEffect, useRef, useState } from 'react';

// Feedback scurt de „se procesează” (implicit 500 ms) înainte de o acțiune instantanee, ca
// utilizatorul să vadă că biletul e verificat. Timerul se anulează dacă ecranul se închide.
export function useBriefLoading(durationMs = 500): [boolean, (action: () => void) => void] {
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  const run = useCallback(
    (action: () => void) => {
      setBusy(true);
      timer.current = setTimeout(() => {
        setBusy(false);
        action();
      }, durationMs);
    },
    [durationMs],
  );
  return [busy, run];
}
