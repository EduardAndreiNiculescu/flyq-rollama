import { useLive } from '../store/live';

/**
 * App configuration. Edit here, then reload the app (no rebuild needed).
 */

/**
 * Venue shown first (must match a bundled `<venueId>.venue.json` in modules/flyq-spatial; the
 * others are in Settings). 'cra-terminal': the new terminal's check-in hall; 'cra-concurs': the old
 * corridor of the contest; 'office-test': the office.
 */
export const VENUE_ID = 'cra-terminal';

/** Port of the FlyQ backend started on the Mac (`npm run dev` in FlyQ-backend/server). */
export const BACKEND_PORT = 3000;

/**
 * Force a backend URL, e.g. 'http://192.168.1.23:3000'. Leave null for automatic:
 * - on a real iPhone in debug, the Mac's address is taken from Metro (same Wi-Fi);
 * - in the simulator, http://localhost:3000.
 */
export const BACKEND_URL_OVERRIDE: string | null = 'https://flyq-cra.duckdns.org';

/** Used when nothing better is known. On a real iPhone "localhost" is the phone itself. */
export const DEFAULT_BACKEND_URL = `http://localhost:${BACKEND_PORT}`;

/** The FlyQ app key: the one entered in the app, else the one baked into the build (EXPO_PUBLIC_FLYQ_KEY). Never written in the repo. */
export const appKey = (): string => useLive.getState().flyqKey || (process.env.EXPO_PUBLIC_FLYQ_KEY ?? '');

/** Demo scenario used for the flight card (see GET /v1/demo/scenarios). */
export const DEMO_SCENARIO = 'normal';

/** How often the backend status is checked (ms). */
export const BACKEND_POLL_MS = 20_000;
