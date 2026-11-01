import { createNavigationContainerRef } from '@react-navigation/native';
import { benchState } from '../bench/state';
import pois from '../data/pois.json';
import { matchPoi } from '../services/live/poiMatch';
import type { Poi } from '../types';
import type { RootStackParamList } from './navigation';

export const navRef = createNavigationContainerRef<RootStackParamList>();

/** NavigationHandler for the assistant: opens the Map tab on the POI that matches the destination. Returns whether it found one. */
export function openMapFor(destination: string, nodeId?: string, mapLabel?: string): boolean {
  // A place that is on the 3D terminal map opens that map with a route to it (iPhone build with the flyq-spatial module)
  if (mapLabel && !benchState.active && navRef.isReady()) {
    navRef.navigate('Main', { screen: 'Map', params: { routeTo: mapLabel } });
    return true;
  }
  // A node the place catalogue already knows is used as is; otherwise the destination text is matched to a point of the terminal.
  const known = nodeId && (pois as Poi[]).some(p => p.nodeId === nodeId) ? nodeId : null;
  const poi = known ? null : matchPoi(destination, pois as Poi[]);
  const target = known ?? poi?.nodeId;
  if (benchState.active || !target || !navRef.isReady()) return false; // a benchmark must not leave its screen
  navRef.navigate('Main', { screen: 'Map', params: { targetNodeId: target } });
  return true;
}
