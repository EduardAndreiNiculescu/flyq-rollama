import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { Ticket } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { StyleSheet } from 'react-native';
import type { TabParamList } from '../app/navigation';
import { EmptyState, ProfileButton, Screen, ScreenHeader } from '../components/Layout';
import { MapPanel } from '../components/map/MapPanel';
import { TicketStrip } from '../components/TicketStrip';
import { useLocalized, useT } from '../i18n';
import { flightData, terminalService } from '../services';
import { useActiveTicket } from '../store/tickets';
import { spacing } from '../theme/tokens';
import { useLayout } from '../theme/responsive';
import { useFlightStatusVersion } from '../store/flightStatus';
import { gateNodeId } from '../lib/gateNode';

export function MapScreen() {
  const t = useT();
  const localized = useLocalized();
  const navigation = useNavigation();
  const { params } = useRoute<RouteProp<TabParamList, 'Map'>>();
  const ticket = useActiveTicket();
  const { sideNav } = useLayout();

  const [debug, setDebug] = useState(false);
  const [floorLabel, setFloorLabel] = useState('');
  const onFloorLabel = useCallback((label: string) => setFloorLabel(label), []);

  useFlightStatusVersion(); // re-render when the server changes the gate or a delay
  const flight = ticket ? flightData.getFlight(ticket.flightId) : null;
  const target = params?.targetNodeId ?? (flight ? gateNodeId(flight.gate) : 'f1_gate3');
  const targetNode = terminalService.getTerminal().nodes.find(n => n.id === target);

  if (!ticket) {
    return (
      <Screen>
        <ScreenHeader title={t('map.title')} />
        <EmptyState icon={Ticket} title={t('journey.empty.title')} body={t('journey.empty.body')} actionLabel={t('journey.empty.cta')} onAction={() => navigation.navigate('AddTicket')} />
      </Screen>
    );
  }

  return (
    <Screen contentStyle={styles.content} top={<TicketStrip />}>
      <ScreenHeader
        title={t('map.title')}
        subtitle={t('map.subtitle', { floor: floorLabel, target: localized(targetNode?.landmark) })}
        // Debug-ul (x, y, σ, status) se deschide doar cu apăsare lungă pe titlu, fără nimic vizibil în antet
        onTitleLongPress={() => setDebug(d => !d)}
        right={sideNav ? <ProfileButton /> : undefined}
      />
      <MapPanel targetNodeId={target} showDebug={debug} onFloorLabel={onFloorLabel} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.sm },
});
