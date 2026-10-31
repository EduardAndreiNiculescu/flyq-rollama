import { useNavigation } from '@react-navigation/native';
import { useCallback } from 'react';
import { parseBcbp, type BcbpError } from '../lib/bcbp';
import { clock, flightData } from '../services';
import { useTickets } from './tickets';

export type AddTicketResult = { ok: true } | { ok: false; error: BcbpError | 'flightNotFound'; flight?: string };

/** Citește codul BCBP, găsește zborul, salvează biletul și deschide cardul de boarding pass. */
export function useAddTicket() {
  const navigation = useNavigation();
  const addTicket = useTickets(s => s.addTicket);

  return useCallback(
    (code: string, isDemo: boolean): AddTicketResult => {
      const parsed = parseBcbp(code);
      if (!parsed.ok) return { ok: false, error: parsed.error };
      const flight = flightData.findFlight(parsed.pass, clock.now());
      if (!flight) {
        return { ok: false, error: 'flightNotFound', flight: `${parsed.pass.carrier} ${parsed.pass.flightNumber}` };
      }
      const ticket = addTicket(parsed.pass, flight.id, isDemo);
      navigation.navigate('Pass', { ticketId: ticket.id, justAdded: true });
      return { ok: true };
    },
    [addTicket, navigation],
  );
}
