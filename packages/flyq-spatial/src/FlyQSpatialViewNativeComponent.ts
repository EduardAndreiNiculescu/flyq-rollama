/**
 * Codegen spec for the native FlyQ spatial view (iOS only).
 *
 * Deliberately tiny surface: two props, one event and one command. Everything else travels
 * as JSON strings, so the native contract can grow without touching codegen.
 */
import type * as React from 'react';
import type { CodegenTypes, HostComponent, ViewProps } from 'react-native';
import { codegenNativeCommands, codegenNativeComponent } from 'react-native';

export type SpatialNativeEvent = Readonly<{
  name: string;
  payload: string;
}>;

export interface NativeProps extends ViewProps {
  venueId?: string;
  debugEnabled?: boolean;
  onSpatialEvent?: CodegenTypes.DirectEventHandler<SpatialNativeEvent>;
}

export interface NativeCommands {
  dispatch: (
    viewRef: React.ComponentRef<HostComponent<NativeProps>>,
    command: string,
    argsJson: string,
  ) => void;
}

export const Commands: NativeCommands = codegenNativeCommands<NativeCommands>({
  supportedCommands: ['dispatch'],
});

export default codegenNativeComponent<NativeProps>(
  'FlyQSpatialView',
) as HostComponent<NativeProps>;
