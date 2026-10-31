import { createBottomTabNavigator, type BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { DefaultTheme, NavigationContainer, type LinkingOptions, type Theme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useEffect } from 'react';
import { StatusBar, StyleSheet, View } from 'react-native';
import { FlyQSplashIntro } from '../components/brand/FlyQSplashIntro';
import { FlightChangeBanner } from '../components/FlightChangeBanner';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Screen } from '../components/Layout';
import { SharedBackground, SharedBackgroundContext } from '../components/SharedBackground';
import { SkeletonScreen } from '../components/Skeleton';
import { hasUpcomingTicket } from '../lib/tickets';
import { AddTicketScreen } from '../screens/AddTicketScreen';
import { FlightNumberScreen } from '../screens/FlightNumberScreen';
import { AssistantScreen } from '../screens/AssistantScreen';
import { FlightTabScreen } from '../screens/FlightTabScreen';
import { MapScreen } from '../screens/MapScreen';
import { PassScreen } from '../screens/PassScreen';
import { PasteScreen } from '../screens/PasteScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { LiveFlightScreen } from '../screens/LiveFlightScreen';
import { LiveScreen } from '../screens/LiveScreen';
import { ScanScreen } from '../screens/ScanScreen';
import { startDeviceLink } from '../services/live/deviceLink';
import { startMemoryGuard } from '../services/live/memoryGuard';
import { startFlightSync } from '../services/live/flightSync';
import { initNotifications } from '../services/live/push';
import { clock, flightData } from '../services';
import { useSplash } from '../store/splash';
import { useTickets } from '../store/tickets';
import { useLayout } from '../theme/responsive';
import { colors } from '../theme/tokens';
import type { RootStackParamList, TabParamList } from './navigation';
import { navRef } from './navRef';
import { TabBar } from './TabBar';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tabs = createBottomTabNavigator<TabParamList>();

// Fundalul real e cerul din SharedBackground (o singură dată, în spatele tab-urilor); navigatorul rămâne transparent.
const navTheme: Theme = {
  ...DefaultTheme,
  colors: { ...DefaultTheme.colors, background: colors.bg, primary: colors.accent, text: colors.text, card: colors.bg },
};

// A tap on the Live Activity opens flyq://live (the scheme is in app.json): the live flight screen, not only the app.
const linking: LinkingOptions<RootStackParamList> = { prefixes: ['flyq://'], config: { screens: { LiveFlight: 'live' } } };

// Definit în afara componentei, ca navigatorul să nu recreeze bara la fiecare randare
const renderTabBar = (props: BottomTabBarProps) => <TabBar {...props} />;

function MainTabs() {
  const { sideNav } = useLayout();
  return (
    <SharedBackgroundContext.Provider value>
      <View style={styles.root}>
        <SharedBackground />
        <Tabs.Navigator
          initialRouteName="Map"
          tabBar={renderTabBar}
          screenOptions={{
            headerShown: false,
            tabBarPosition: sideNav ? 'left' : 'bottom',
            sceneStyle: { backgroundColor: 'transparent' },
            animation: 'fade',
          }}
        >
          <Tabs.Screen name="Flight" component={FlightTabScreen} />
          <Tabs.Screen name="Map" component={MapScreen} />
          <Tabs.Screen name="Assistant" component={AssistantScreen} />
        </Tabs.Navigator>
      </View>
    </SharedBackgroundContext.Provider>
  );
}

function RootNavigator() {
  const hydrated = useTickets(s => s.hydrated);
  const tickets = useTickets(s => s.tickets);
  const { sideNav } = useLayout();

  // Până se citesc biletele salvate, arătăm un schelet cu forma ecranului, ca layout-ul să nu sară
  if (!hydrated) {
    return (
      <Screen bottomInset="safeArea">
        <SkeletonScreen />
      </Screen>
    );
  }

  const initial = hasUpcomingTicket(tickets, id => flightData.getFlight(id), clock.now()) ? 'Main' : 'AddTicket';
  return (
    <Stack.Navigator
      initialRouteName={initial}
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.bg },
        animation: sideNav ? 'fade' : 'slide_from_right',
      }}
    >
      <Stack.Screen name="AddTicket" component={AddTicketScreen} />
      <Stack.Screen name="Scan" component={ScanScreen} />
      <Stack.Screen name="Paste" component={PasteScreen} />
      <Stack.Screen name="FlightNumber" component={FlightNumberScreen} />
      <Stack.Screen name="Pass" component={PassScreen} />
      <Stack.Screen name="Live" component={LiveScreen} />
      <Stack.Screen name="LiveFlight" component={LiveFlightScreen} options={{ animation: 'fade_from_bottom' }} />
      <Stack.Screen name="Profile" component={ProfileScreen} />
      <Stack.Screen name="Main" component={MainTabs} options={{ animation: 'fade' }} />
    </Stack.Navigator>
  );
}

export default function App() {
  // Animația de pornire stă peste aplicație și se demontează singură după intrarea „prin lentilă”
  const { visible: showSplash, runId, hide } = useSplash();
  useEffect(() => {
    startDeviceLink(); // lets the laptop drive this app for tests (needs the gateway token in Test mode)
    initNotifications(); // show pushes that arrive while the app is open
    startMemoryGuard(); // frees the model when the app goes to the background or iOS warns about memory
    return startFlightSync(); // the screens follow what the FlyQ server says (gate, delay)
  }, []);
  return (
    <GestureHandlerRootView style={styles.fill}>
      <SafeAreaProvider>
        {/* Doar temă luminoasă: bara de stare are mereu text închis */}
        <StatusBar barStyle="dark-content" />
        <NavigationContainer ref={navRef} theme={navTheme} linking={linking}>
          <RootNavigator />
        </NavigationContainer>
        <FlightChangeBanner />
        {showSplash ? <FlyQSplashIntro key={runId} onDone={hide} /> : null}
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  root: { flex: 1 },
});
