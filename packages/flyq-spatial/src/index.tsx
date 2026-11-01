/**
 * <FlyQSpatialView />: the 3D venue map with the user's pin and camera localisation (iOS).
 *
 *   const ref = useRef<FlyQSpatialViewHandle>(null);
 *   <FlyQSpatialView ref={ref} venueId="office-test" onEvent={handle} style={{ flex: 1 }} />
 *   ref.current?.send('startLocalization');
 */
import * as React from 'react';
import {
  type NativeSyntheticEvent,
  Platform,
  StyleSheet,
  Text,
  View,
  type ViewProps,
} from 'react-native';

import {
  parseSpatialEvent,
  type SpatialCommand,
  type SpatialEvent,
} from './events';
import NativeFlyQSpatialView, {
  Commands,
  type SpatialNativeEvent,
} from './FlyQSpatialViewNativeComponent';

export * from './events';

export interface FlyQSpatialViewHandle {
  /** Sends a command to the native view. Returns false when the view is not mounted yet. */
  send: (command: SpatialCommand, args?: Record<string, unknown>) => boolean;
}

export interface FlyQSpatialViewProps extends ViewProps {
  venueId?: string;
  debugEnabled?: boolean;
  onEvent?: (event: SpatialEvent) => void;
}

type NativeRef = React.ComponentRef<typeof NativeFlyQSpatialView>;

export const FlyQSpatialView = React.forwardRef<
  FlyQSpatialViewHandle,
  FlyQSpatialViewProps
>(function FlyQSpatialViewImpl(
  { venueId, debugEnabled, onEvent, style, ...rest },
  ref,
) {
  const nativeRef = React.useRef<NativeRef | null>(null);
  const onEventRef = React.useRef(onEvent);
  onEventRef.current = onEvent;

  React.useImperativeHandle(
    ref,
    () => ({
      send(command, args) {
        const node = nativeRef.current;
        if (!node) {
          return false;
        }
        let json = '{}';
        try {
          json = JSON.stringify(args ?? {});
        } catch {
          json = '{}';
        }
        Commands.dispatch(node, command, json);
        return true;
      },
    }),
    [],
  );

  const handleNativeEvent = React.useCallback(
    (event: NativeSyntheticEvent<SpatialNativeEvent>) => {
      const { name, payload } = event.nativeEvent;
      onEventRef.current?.(parseSpatialEvent(name, payload));
    },
    [],
  );

  if (Platform.OS !== 'ios') {
    return (
      <View style={[styles.unsupported, style]} {...rest}>
        <Text style={styles.unsupportedText}>
          Harta 3D și localizarea merg doar pe iPhone.
        </Text>
      </View>
    );
  }

  return (
    <NativeFlyQSpatialView
      {...rest}
      ref={nativeRef}
      style={style}
      venueId={venueId ?? ''}
      debugEnabled={debugEnabled ?? false}
      onSpatialEvent={handleNativeEvent}
    />
  );
});

const styles = StyleSheet.create({
  unsupported: {
    alignItems: 'center',
    backgroundColor: '#0B1430',
    justifyContent: 'center',
    padding: 24,
  },
  unsupportedText: {
    color: '#FFFFFF',
    textAlign: 'center',
  },
});
