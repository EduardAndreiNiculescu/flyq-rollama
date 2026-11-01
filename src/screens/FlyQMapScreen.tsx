import { MapScreen } from '../flyq/screens/MapScreen';

/**
 * The 3D terminal map from the flyq-spatial module (Denis): drawn plan, labels, routes, camera localization. Native iOS only; on other platforms
 * the module shows its own "iPhone only" text. Reached from Profile; the existing Map tab (terminal.json) is untouched.
 */
export function FlyQMapScreen() {
  return <MapScreen />;
}
