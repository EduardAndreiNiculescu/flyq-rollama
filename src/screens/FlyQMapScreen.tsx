import { useRoute, type RouteProp } from '@react-navigation/native';
import { View } from 'react-native';
import { MapScreen } from '../flyq/screens/MapScreen';
import type { RootStackParamList } from '../app/navigation';

/**
 * The 3D terminal map from the flyq-spatial module (Denis): drawn plan, labels, routes, camera localization. Native iOS only; on other platforms
 * the module shows its own "iPhone only" text. Reached from Profile or from the assistant ("where is Coco's bar": `routeTo` is the label's id).
 */
export function FlyQMapScreen() {
  const route = useRoute<RouteProp<RootStackParamList, 'FlyQMap'>>();
  return <MapScreen initialRoute={route.params?.routeTo} />;
}

/**
 * The Map tab: Denis's 3D terminal map. Room is left at the bottom for the floating tab bar. The old schematic map stays reachable
 * from Profile ("Harta veche"), and the assistant opens a place with a route through the `FlyQMap` stack screen.
 */
export function FlyQMapTab() {
  return (
    <View style={{ flex: 1, paddingBottom: 118 }}>
      <MapScreen />
    </View>
  );
}
