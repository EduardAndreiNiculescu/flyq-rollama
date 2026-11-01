import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import {
  BackendError,
  type Flight,
  getDemoFlight,
  getHealth,
} from '../api/backend';
import { backendBaseUrl } from '../api/backendUrl';
import { BACKEND_POLL_MS } from '../config';

export type BackendStatus = 'checking' | 'online' | 'offline';

export interface BackendInfo {
  status: BackendStatus;
  url: string;
  version: string | null;
  lastError: string | null;
  flight: Flight | null;
  refresh: () => void;
}

/** Polls /v1/health and, while online, loads the demo flight shown on the map screen. */
export function useBackend(): BackendInfo {
  const [status, setStatus] = useState<BackendStatus>('checking');
  const [version, setVersion] = useState<string | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [flight, setFlight] = useState<Flight | null>(null);
  const mounted = useRef(true);
  const running = useRef(false);

  const check = useCallback(async () => {
    if (running.current) {
      return;
    }
    running.current = true;
    try {
      const health = await getHealth();
      if (!mounted.current) {
        return;
      }
      setStatus('online');
      setVersion(health.version ?? null);
      setLastError(null);
      try {
        const next = await getDemoFlight();
        if (mounted.current) {
          setFlight(next);
        }
      } catch (error) {
        if (mounted.current) {
          setLastError(
            error instanceof BackendError ? error.code : String(error),
          );
        }
      }
    } catch (error) {
      if (!mounted.current) {
        return;
      }
      setStatus('offline');
      setLastError(
        error instanceof BackendError
          ? error.code === 'NETWORK'
            ? `NETWORK: ${error.message}`
            : error.code
          : String(error),
      );
    } finally {
      running.current = false;
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    check();
    // Every 5 s while offline (the Mac's server may start later), slower once online.
    const timer = setInterval(
      check,
      status === 'online' ? BACKEND_POLL_MS : Math.min(5000, BACKEND_POLL_MS),
    );
    const subscription = AppState.addEventListener('change', next => {
      if (next === 'active') {
        check();
      }
    });
    return () => {
      mounted.current = false;
      clearInterval(timer);
      subscription.remove();
    };
  }, [check, status]);

  return {
    status,
    url: backendBaseUrl(),
    version,
    lastError,
    flight,
    refresh: check,
  };
}
