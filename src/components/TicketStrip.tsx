import { useNavigation } from '@react-navigation/native';
import { useT } from '../i18n';
import { formatLocalTime } from '../lib/time';
import { flightData } from '../services';
import { useActiveTicket } from '../store/tickets';
import { useLayout } from '../theme/responsive';
import { CompactFlightHeaderPill } from './CompactFlightHeaderPill';
import { PressableScale } from './press';

// Biletul în formă mică, fixat sus pe Călătorie, Hartă și Asistent: pastila cu ruta, zborul,
// poarta și ora de plecare. Atingerea deschide boarding pass-ul complet.
export function TicketStrip() {
  const t = useT();
  const navigation = useNavigation();
  const ticket = useActiveTicket();
  const { sideNav } = useLayout();

  const flight = ticket ? flightData.getFlight(ticket.flightId) : null;
  const from = flight ? flightData.getAirport(flight.from) : null;
  // Pe tableta în landscape biletul e deja în meniul lateral
  if (!ticket || !flight || !from || sideNav) return null;

  const departure = formatLocalTime(flight.departureUtc, from.utcOffsetMin);
  const label = t('strip.a11y', {
    from: flight.from,
    to: flight.to,
    flight: `${flight.carrier} ${flight.flightNumber}`,
    seat: ticket.pass.seat,
    gate: flight.gate,
    time: departure,
  });

  return (
    <PressableScale
      onPress={() => navigation.navigate('Pass', { ticketId: ticket.id })}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={t('strip.hint')}
    >
      <CompactFlightHeaderPill
        from={flight.from}
        to={flight.to}
        flight={`${flight.carrier} ${flight.flightNumber}`}
        gate={flight.gate}
        departure={departure}
        chevron
      />
    </PressableScale>
  );
}

