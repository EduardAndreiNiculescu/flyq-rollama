import { createBottomTabNavigator, type BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { DefaultTheme, NavigationContainer, type Theme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useEffect } from 'react';
import { StatusBar, StyleSheet, View } from 'react-native';
import { FlyQSplashIntro } from '../components/brand/FlyQSplashIntro';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Screen } from '../components/Layout';
import { SharedBackground, SharedBackgroundContext } from '../components/SharedBackground';
import { SkeletonScreen } from '../components/Skeleton';
import { hasUpcomingTicket } from '../lib/tickets';
import { AddTicketScreen } from '../screens/AddTicketScreen';
import { AssistantScreen } from '../screens/AssistantScreen';
import { FlightScreen } from '../screens/FlightScreen';
import { JourneyScreen } from '../screens/JourneyScreen';
import { MapScreen } from '../screens/MapScreen';
import { PassScreen } from '../screens/PassScreen';
import { PasteScreen } from '../screens/PasteScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { LiveScreen } from '../screens/LiveScreen';
import { ScanScreen } from '../screens/ScanScreen';
import { startDeviceLink } from '../services/live/deviceLink';
import { startMemoryGuard } from '../services/live/memoryGuard';
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

// Definit în afara componentei, ca navigatorul să nu recreeze bara la fiecare randare
const renderTabBar = (props: BottomTabBarProps) => <TabBar {...props} />;

function MainTabs() {
  const { sideNav } = useLayout();
  return (
    <SharedBackgroundContext.Provider value>
      <View style={styles.root}>
        <SharedBackground />
        <Tabs.Navigator
          tabBar={renderTabBar}
          screenOptions={{
            headerShown: false,
            tabBarPosition: sideNav ? 'left' : 'bottom',
            sceneStyle: { backgroundColor: 'transparent' },
            animation: 'fade',
          }}
        >
          <Tabs.Screen name="Journey" component={JourneyScreen} />
          <Tabs.Screen name="Flight" component={FlightScreen} />
          {/* Harta stă în centru: e ecranul folosit cel mai des în aeroport */}
          <Tabs.Screen name="Map" component={MapScreen} />
          <Tabs.Screen name="Assistant" component={AssistantScreen} />
          <Tabs.Screen name="Profile" component={ProfileScreen} />
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
      <Stack.Screen name="Pass" component={PassScreen} />
      <Stack.Screen name="Live" component={LiveScreen} />
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
  }, []);
  return (
    <GestureHandlerRootView style={styles.fill}>
      <SafeAreaProvider>
        {/* Doar temă luminoasă: bara de stare are mereu text închis */}
        <StatusBar barStyle="dark-content" />
        <NavigationContainer ref={navRef} theme={navTheme}>
          <RootNavigator />
        </NavigationContainer>
        {showSplash ? <FlyQSplashIntro key={runId} onDone={hide} /> : null}
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  root: { flex: 1 },
});
