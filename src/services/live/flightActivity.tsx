import { HStack, Image, ProgressView, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import { activityBackgroundTint, backgroundOverlay, bold, clipShape, font, foregroundStyle, monospacedDigit, padding, strikethrough, tint } from '@expo/ui/swift-ui/modifiers';
import { createLiveActivity } from 'expo-widgets';

/**
 * The Live Activity card (lock screen banner + Dynamic Island), full black like the Dynamic Island. The keys are the FlyQ server's
 * `content-state` contract (docs/backend/live-activity-contract.json in the backend repo); flightNumber/from/to, the two epochs and
 * arrivalTime are optional additions. The component runs inside the widget extension: no hooks, no imports used in the body, no module-scope values.
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
  arrivalTime?: string | null; // local time at the destination
  delayMinutes: number;
  updatedAt: number; // unix seconds
  boardingEpoch?: number | null; // unix seconds: with it the card counts down to boarding by itself, without server updates
  departureEpoch?: number | null;
  arrivalEpoch?: number | null; // unix seconds, estimated landing from the live position: the card then counts down to landing
  progress?: number | null; // 0..1 of the route flown; replaces the stage-based bar once the aircraft is in the air
};

const FlightActivity = (props: FlightActivityProps) => {
  'widget';
  const white = '#FFFFFF';
  const gray = '#8E8E93';
  const labels: Record<string, string> = { checkin: 'Check-in deschis', scheduled: 'La timp', boarding: 'Îmbarcare', delayed: 'Întârziat', gate_closing: 'Poarta se închide', departed: 'În zbor', landed: 'A aterizat', cancelled: 'Anulat', diverted: 'Deviat' };
  const colors: Record<string, string> = { checkin: '#64D2FF', scheduled: '#30D158', boarding: '#30D158', delayed: '#FF9F0A', gate_closing: '#FF6B35', departed: '#64D2FF', landed: '#30D158', cancelled: '#FF453A', diverted: '#FF9F0A' };
  const stage: Record<string, number> = { checkin: 0.2, scheduled: 0.1, delayed: 0.1, boarding: 0.4, gate_closing: 0.7, departed: 1, landed: 1, cancelled: 0, diverted: 0.6 };
  const status = labels[props.status] ?? 'Zbor';
  const color = colors[props.status] ?? '#30D158';
  const late = props.delayMinutes > 0;
  const estimated = props.estimatedDeparture && props.estimatedDeparture !== props.departureTime ? props.estimatedDeparture : null;
  const from = props.from ?? 'CRA';
  const to = props.to ?? '···';
  const flight = props.flightNumber ?? 'FlyQ';
  const counting = !!props.boardingEpoch && props.boardingEpoch > props.updatedAt && (props.status === 'scheduled' || props.status === 'delayed');

  const gateBadge = props.gate ? (
    <HStack spacing={4} modifiers={[padding({ horizontal: 10, vertical: 5 }), backgroundOverlay({ color: '#FFD60A' }), clipShape('capsule')]}>
      <Image systemName="door.left.hand.open" color="#000000" size={12} />
      <Text modifiers={[font({ weight: 'heavy', size: 15 }), monospacedDigit(), foregroundStyle('#000000')]}>{props.gate}</Text>
    </HStack>
  ) : (
    <Text modifiers={[font({ weight: 'semibold', size: 12 }), foregroundStyle(gray), padding({ horizontal: 10, vertical: 5 }), backgroundOverlay({ color: '#2C2C2E' }), clipShape('capsule')]}>Poartă neanunțată</Text>
  );

  const flying = props.status === 'departed' && !!props.arrivalEpoch && props.arrivalEpoch > props.updatedAt;
  const line = <ProgressView value={typeof props.progress === 'number' ? props.progress : stage[props.status] ?? 0.1} modifiers={[tint(color)]} />;

  const detail = flying ? (
    <HStack spacing={4}>
      <Text modifiers={[font({ size: 13 }), foregroundStyle(gray)]}>Aterizare în</Text>
      <Text timerInterval={{ lower: new Date(props.updatedAt * 1000), upper: new Date((props.arrivalEpoch as number) * 1000) }} countsDown modifiers={[font({ weight: 'semibold', size: 13 }), monospacedDigit(), foregroundStyle(white)]} />
    </HStack>
  ) : counting ? (
    <HStack spacing={4}>
      <Text modifiers={[font({ size: 13 }), foregroundStyle(gray)]}>Îmbarcare în</Text>
      <Text timerInterval={{ lower: new Date(props.updatedAt * 1000), upper: new Date((props.boardingEpoch as number) * 1000) }} countsDown modifiers={[font({ weight: 'semibold', size: 13 }), monospacedDigit(), foregroundStyle(white)]} />
    </HStack>
  ) : (
    <Text modifiers={[font({ size: 13 }), foregroundStyle(gray)]}>{late ? `Întârziere ${props.delayMinutes} min` : props.boardingTime ? `Îmbarcare ${props.boardingTime}` : 'Urmărit în timp real'}</Text>
  );

  const statusRow = (
    <HStack spacing={6}>
      <Image systemName="circle.fill" color={color} size={8} />
      <Text modifiers={[font({ weight: 'semibold', size: 14 }), foregroundStyle(color)]}>{status}</Text>
    </HStack>
  );

  return {
    banner: (
      <VStack spacing={12} modifiers={[padding({ all: 16 }), activityBackgroundTint('#000000')]}>
        <HStack>
          <Text modifiers={[font({ weight: 'semibold', size: 13 }), foregroundStyle(gray)]}>{flight}</Text>
          <Spacer />
          {gateBadge}
        </HStack>
        <HStack spacing={10}>
          <VStack alignment="leading" spacing={2}>
            <Text modifiers={[font({ weight: 'heavy', size: 34 }), foregroundStyle(white)]}>{from}</Text>
            {estimated ? (
              <HStack spacing={4}>
                <Text modifiers={[font({ size: 12 }), foregroundStyle(gray), strikethrough({ isActive: true, pattern: 'solid' })]}>{props.departureTime}</Text>
                <Text modifiers={[font({ weight: 'semibold', size: 13 }), monospacedDigit(), foregroundStyle(color)]}>{estimated}</Text>
              </HStack>
            ) : (
              <Text modifiers={[font({ weight: 'semibold', size: 13 }), monospacedDigit(), foregroundStyle(gray)]}>{props.departureTime}</Text>
            )}
          </VStack>
          <Image systemName="airplane" color={color} size={16} />
          {line}
          <VStack alignment="trailing" spacing={2}>
            <Text modifiers={[font({ weight: 'heavy', size: 34 }), foregroundStyle(white)]}>{to}</Text>
            <Text modifiers={[font({ weight: 'semibold', size: 13 }), monospacedDigit(), foregroundStyle(gray)]}>{props.arrivalTime ?? ' '}</Text>
          </VStack>
        </HStack>
        <HStack>
          {statusRow}
          <Spacer />
          {detail}
        </HStack>
      </VStack>
    ),
    compactLeading: <Image systemName={props.status === 'landed' ? 'airplane.arrival' : 'airplane.departure'} color={color} />,
    compactTrailing: <Text modifiers={[bold(), monospacedDigit(), foregroundStyle(late && props.status === 'delayed' ? '#FF9F0A' : '#FFD60A')]}>{late && props.status === 'delayed' ? `+${props.delayMinutes}'` : props.gate ? props.gate : props.departureTime}</Text>,
    minimal: <Image systemName="airplane" color={color} />,
    expandedLeading: (
      <VStack alignment="leading" spacing={2} modifiers={[padding({ leading: 6 })]}>
        <Text modifiers={[font({ weight: 'heavy', size: 28 }), foregroundStyle(white)]}>{from}</Text>
        <Text modifiers={[font({ weight: 'semibold', size: 12 }), monospacedDigit(), foregroundStyle(estimated ? color : gray)]}>{estimated ?? props.departureTime}</Text>
      </VStack>
    ),
    expandedTrailing: (
      <VStack alignment="trailing" spacing={2} modifiers={[padding({ trailing: 6 })]}>
        <Text modifiers={[font({ weight: 'heavy', size: 28 }), foregroundStyle(white)]}>{to}</Text>
        <Text modifiers={[font({ weight: 'semibold', size: 12 }), monospacedDigit(), foregroundStyle(gray)]}>{props.arrivalTime ?? ' '}</Text>
      </VStack>
    ),
    expandedCenter: (
      <VStack spacing={4}>
        <Image systemName="airplane" color={color} size={18} />
        {statusRow}
      </VStack>
    ),
    expandedBottom: (
      <VStack spacing={8} modifiers={[padding({ horizontal: 8 })]}>
        {line}
        <HStack>
          {gateBadge}
          <Spacer />
          {detail}
        </HStack>
      </VStack>
    ),
  };
};

export default createLiveActivity('FlyQFlight', FlightActivity);
