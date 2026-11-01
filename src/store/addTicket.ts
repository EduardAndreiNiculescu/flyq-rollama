import { useNavigation } from '@react-navigation/native';
import { useCallback } from 'react';
import type { TranslationKey } from '../i18n/ro';
import { parseBcbp, type BcbpError } from '../lib/bcbp';
import { clock, flightData } from '../services';
import { resolveRealTicket, type RealTicketFailure } from '../services/live/realTicket';
import { useLive } from './live';
import { useTickets } from './tickets';

export type AddTicketResult = { ok: true } | { ok: false; error: BcbpError | RealTicketFailure; flight?: string };

/** The message for a failed add, for the screens that show it */
export function addTicketMessage(result: Extract<AddTicketResult, { ok: false }>, t: (key: TranslationKey, vars?: Record<string, string | number>) => string): string {
  if (result.error === 'flightNotFound') return t('add.notFound', { flight: result.flight ?? '' });
  if (result.error === 'noNetwork' || result.error === 'unauthorized' || result.error === 'upstream' || result.error === 'wrongDay' || result.error === 'badFlight') return t(`add.err.${result.error}` as TranslationKey);
  return t(`paste.err.${result.error}` as TranslationKey);
}

/**
 * Reads the BCBP code, finds the flight, saves the ticket and opens the boarding pass. The bundled schedule is tried first (demo tickets);
 * a real ticket whose flight is not there is looked up on the server by flight number and day (see realTicket.ts).
 */
export function useAddTicket() {
  const navigation = useNavigation();
  const addTicket = useTickets(s => s.addTicket);

  return useCallback(
    async (code: string, isDemo: boolean): Promise<AddTicketResult> => {
      const parsed = parseBcbp(code);
      if (!parsed.ok) return { ok: false, error: parsed.error };
      const label = `${parsed.pass.carrier} ${parsed.pass.flightNumber}`;
      let flightId = flightData.findFlight(parsed.pass, clock.now())?.id;
      if (!flightId) {
        const live = await resolveRealTicket(parsed.pass, clock.now());
        if (!live.ok) return { ok: false, error: live.error, flight: label };
        flightId = live.flightId;
        useLive.getState().setTrackerSource('live');
      }
      // The ticket keeps the passenger, seat and PNR from the code itself; only the flight comes from the schedule or the server
      const ticket = addTicket(parsed.pass, flightId, isDemo);
      navigation.navigate('Pass', { ticketId: ticket.id, justAdded: true });
      return { ok: true };
    },
    [addTicket, navigation],
  );
}
