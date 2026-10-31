import { HStack, Image, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import { font, foregroundStyle, padding } from '@expo/ui/swift-ui/modifiers';
import { createLiveActivity } from 'expo-widgets';

/**
 * The Live Activity card (lock screen banner + Dynamic Island). The keys are the FlyQ server's `content-state` contract
 * (docs/backend/live-activity-contract.json in the backend repo); flightNumber/from/to are optional additions the app sets itself.
 * The component runs inside the widget extension: no hooks, no imports used in the body, no module-scope values.
 */
export type FlightActivityProps = {
  flightNumber?: string;
  from?: string;
  to?: string;
  status: string; // scheduled | boarding | delayed | gate_closing | departed | landed | cancelled | diverted
  gate?: string | null;
  boardingTime?: string | null; // "08:35", Craiova time
  departureTime: string; // "08:40"
  estimatedDeparture?: string | null;
  delayMinutes: number;
  updatedAt: number; // unix seconds
};

const FlightActivity = (props: FlightActivityProps) => {
  'widget';
  const labels: Record<string, string> = {
    scheduled: 'La timp',
    boarding: 'Îmbarcare',
    delayed: 'Întârziat',
    gate_closing: 'Poarta se închide',
    departed: 'A decolat',
    landed: 'A aterizat',
    cancelled: 'Anulat',
    diverted: 'Deviat',
  };
  const status = labels[props.status] ?? 'Zbor';
  const bad = props.status === 'delayed' || props.status === 'cancelled' || props.status === 'diverted';
  const tint = bad ? '#FF9F0A' : props.status === 'boarding' || props.status === 'gate_closing' ? '#34C759' : '#5B8CFF';
  const gate = props.gate ? `Poarta ${props.gate}` : 'Poartă neanunțată';
  const time = props.estimatedDeparture && props.estimatedDeparture !== props.departureTime ? `${props.departureTime} → ${props.estimatedDeparture}` : props.departureTime;
  const route = props.from && props.to ? `${props.from} → ${props.to}` : 'FlyQ';
  const title = props.flightNumber ? `${props.flightNumber} · ${route}` : route;
  return {
    banner: (
      <VStack modifiers={[padding({ all: 14 })]}>
        <HStack>
          <Text modifiers={[font({ weight: 'bold', size: 17 })]}>{title}</Text>
          <Spacer />
          <Text modifiers={[font({ weight: 'semibold', size: 15 }), foregroundStyle(tint)]}>{status}</Text>
        </HStack>
        <HStack>
          <Text modifiers={[font({ weight: 'bold', size: 26 })]}>{gate}</Text>
          <Spacer />
          <Text modifiers={[font({ size: 15 })]}>{`Decolare ${time}`}</Text>
        </HStack>
        {props.boardingTime ? <Text modifiers={[font({ size: 13 })]}>{`Îmbarcare ${props.boardingTime}`}</Text> : <Text modifiers={[font({ size: 13 })]}>{props.delayMinutes > 0 ? `Întârziere ${props.delayMinutes} min` : ' '}</Text>}
      </VStack>
    ),
    compactLeading: <Image systemName="airplane" color={tint} />,
    compactTrailing: <Text modifiers={[font({ weight: 'bold' })]}>{props.gate ? props.gate : props.departureTime}</Text>,
    minimal: <Image systemName="airplane" color={tint} />,
    expandedLeading: <Image systemName="airplane" color={tint} />,
    expandedTrailing: <Text modifiers={[font({ weight: 'bold', size: 20 })]}>{props.gate ? props.gate : '—'}</Text>,
    expandedBottom: <Text>{`${status} · ${time}`}</Text>,
  };
};

export default createLiveActivity('FlyQFlight', FlightActivity);
