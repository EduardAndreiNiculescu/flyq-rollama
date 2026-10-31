import { createNavigationContainerRef } from '@react-navigation/native';
import { benchState } from '../bench/state';
import pois from '../data/pois.json';
import { matchPoi } from '../services/live/poiMatch';
import type { Poi } from '../types';
import type { RootStackParamList } from './navigation';

export const navRef = createNavigationContainerRef<RootStackParamList>();

/** NavigationHandler for the assistant: opens the Map tab on the POI that matches the destination. Returns whether it found one. */
export function openMapFor(destination: string): boolean {
  const poi = matchPoi(destination, pois as Poi[]);
  if (benchState.active || !poi || !navRef.isReady()) return false; // a benchmark must not leave its screen
  navRef.navigate('Main', { screen: 'Map', params: { targetNodeId: poi.nodeId } });
  return true;
}
