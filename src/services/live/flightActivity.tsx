import { HStack, Image, ProgressView, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import { backgroundOverlay, bold, clipShape, font, foregroundStyle, monospacedDigit, padding, strikethrough, tint } from '@expo/ui/swift-ui/modifiers';
import { createLiveActivity } from 'expo-widgets';

/**
 * The Live Activity card (lock screen banner + Dynamic Island). The keys are the FlyQ server's `content-state` contract
 * (docs/backend/live-activity-contract.json in the backend repo); flightNumber/from/to and the two epochs are optional additions.
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
  boardingEpoch?: number | null; // unix seconds: with it the card counts down to boarding by itself, without server updates
  departureEpoch?: number | null;
};

const FlightActivity = (props: FlightActivityProps) => {
  'widget';
  const labels: Record<string, string> = { scheduled: 'La timp', boarding: 'Îmbarcare', delayed: 'Întârziat', gate_closing: 'Poarta se închide', departed: 'A decolat', landed: 'A aterizat', cancelled: 'Anulat', diverted: 'Deviat' };
  const colors: Record<string, string> = { scheduled: '#5B8CFF', boarding: '#34C759', delayed: '#FF9F0A', gate_closing: '#FF6B35', departed: '#64D2FF', landed: '#30D158', cancelled: '#FF453A', diverted: '#FF9F0A' };
  const stage: Record<string, number> = { scheduled: 0.12, delayed: 0.12, boarding: 0.5, gate_closing: 0.82, departed: 1, landed: 1, cancelled: 0, diverted: 0.6 };
  const status = labels[props.status] ?? 'Zbor';
  const color = colors[props.status] ?? '#5B8CFF';
  const gate = props.gate ? props.gate : '–';
  const late = props.delayMinutes > 0;
  const estimated = props.estimatedDeparture && props.estimatedDeparture !== props.departureTime ? props.estimatedDeparture : null;
  const route = props.from && props.to ? `${props.from}  ✈  ${props.to}` : 'FlyQ';
  const flight = props.flightNumber ?? 'FlyQ';
  const countdown = props.boardingEpoch && props.boardingEpoch > props.updatedAt && (props.status === 'scheduled' || props.status === 'delayed');
  const progress = countdown ? (
    <ProgressView timerInterval={{ lower: new Date(props.updatedAt * 1000), upper: new Date((props.boardingEpoch as number) * 1000) }} countsDown modifiers={[tint(color)]}>
      <Text modifiers={[font({ size: 12 }), foregroundStyle('#8E8E93')]}>Până la îmbarcare</Text>
    </ProgressView>
  ) : (
    <ProgressView value={stage[props.status] ?? 0.1} modifiers={[tint(color)]}>
      <Text modifiers={[font({ size: 12 }), foregroundStyle('#8E8E93')]}>{props.boardingTime ? `Îmbarcare ${props.boardingTime}` : 'Urmărit în timp real'}</Text>
    </ProgressView>
  );
  const pill = (
    <Text modifiers={[font({ weight: 'semibold', size: 13 }), foregroundStyle(color), padding({ horizontal: 10, vertical: 4 }), backgroundOverlay({ color: color + '2E' }), clipShape('capsule')]}>{late && props.status === 'delayed' ? `${status} +${props.delayMinutes} min` : status}</Text>
  );
  return {
    banner: (
      <VStack spacing={10} modifiers={[padding({ all: 16 })]}>
        <HStack spacing={8}>
          <Image systemName="airplane.departure" color={color} />
          <Text modifiers={[font({ weight: 'bold', size: 16 })]}>{flight}</Text>
          <Text modifiers={[font({ size: 14 }), foregroundStyle('#8E8E93')]}>{route}</Text>
          <Spacer />
          {pill}
        </HStack>
        <HStack>
          <VStack alignment="leading" spacing={2}>
            <Text modifiers={[font({ weight: 'semibold', size: 11 }), foregroundStyle('#8E8E93')]}>POARTA</Text>
            <Text modifiers={[font({ weight: 'heavy', size: 40 }), monospacedDigit(), foregroundStyle(color)]}>{gate}</Text>
          </VStack>
          <Spacer />
          <VStack alignment="trailing" spacing={2}>
            <Text modifiers={[font({ weight: 'semibold', size: 11 }), foregroundStyle('#8E8E93')]}>DECOLARE</Text>
            {estimated ? (
              <HStack spacing={6}>
                <Text modifiers={[font({ size: 15 }), foregroundStyle('#8E8E93'), strikethrough({ isActive: true, pattern: 'solid' })]}>{props.departureTime}</Text>
                <Text modifiers={[font({ weight: 'bold', size: 26 }), monospacedDigit(), foregroundStyle(color)]}>{estimated}</Text>
              </HStack>
            ) : (
              <Text modifiers={[font({ weight: 'bold', size: 26 }), monospacedDigit()]}>{props.departureTime}</Text>
            )}
          </VStack>
        </HStack>
        {progress}
      </VStack>
    ),
    compactLeading: <Image systemName={props.status === 'landed' ? 'airplane.arrival' : 'airplane.departure'} color={color} />,
    compactTrailing: <Text modifiers={[bold(), monospacedDigit(), foregroundStyle(color)]}>{late && props.status === 'delayed' ? `+${props.delayMinutes}'` : props.gate ? props.gate : props.departureTime}</Text>,
    minimal: <Image systemName="airplane" color={color} />,
    expandedLeading: (
      <VStack alignment="leading" spacing={2} modifiers={[padding({ leading: 6 })]}>
        <Image systemName="airplane.departure" color={color} />
        <Text modifiers={[font({ weight: 'bold', size: 15 })]}>{flight}</Text>
      </VStack>
    ),
    expandedTrailing: (
      <VStack alignment="trailing" spacing={0} modifiers={[padding({ trailing: 6 })]}>
        <Text modifiers={[font({ weight: 'semibold', size: 10 }), foregroundStyle('#8E8E93')]}>POARTA</Text>
        <Text modifiers={[font({ weight: 'heavy', size: 30 }), monospacedDigit(), foregroundStyle(color)]}>{gate}</Text>
      </VStack>
    ),
    expandedCenter: (
      <VStack spacing={2}>
        <Text modifiers={[font({ weight: 'semibold', size: 14 })]}>{route}</Text>
        {pill}
      </VStack>
    ),
    expandedBottom: (
      <VStack spacing={6} modifiers={[padding({ horizontal: 8 })]}>
        {progress}
        <Text modifiers={[font({ size: 12 }), foregroundStyle('#8E8E93')]}>{estimated ? `Decolare ${props.departureTime} → ${estimated}` : `Decolare ${props.departureTime}`}</Text>
      </VStack>
    ),
  };
};

export default createLiveActivity('FlyQFlight', FlightActivity);
