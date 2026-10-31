import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Map, Plane, Route, Sparkles, User, type LucideIcon } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '../components/AppText';
import { Glass } from '../components/Glass';
import { PressableScale } from '../components/press';
import { useT, type TranslationKey } from '../i18n';
import { flightData } from '../services';
import { useActiveTicket } from '../store/tickets';
import { useLayout } from '../theme/responsive';
import { colors, spacing } from '../theme/tokens';
import { formatLocalTime } from '../lib/time';
import { TAB_BAR_HEIGHT, TAB_BAR_LIFT, TAB_BAR_MARGIN } from './tabBarInset';
import { BrandLogo } from '../components/BrandLogo';

const TABS: Record<string, { icon: LucideIcon; label: TranslationKey }> = {
  Journey: { icon: Route, label: 'tabs.journey' },
  Map: { icon: Map, label: 'tabs.map' },
  Flight: { icon: Plane, label: 'tabs.flight' },
  Assistant: { icon: Sparkles, label: 'tabs.assistant' },
  Profile: { icon: User, label: 'tabs.profile' },
};

export function TabBar({ state, navigation }: BottomTabBarProps) {
  const t = useT();
  const insets = useSafeAreaInsets();
  const { sideNav, sizeClass } = useLayout();
  const ticket = useActiveTicket();

  const go = (routeKey: string, routeName: string, focused: boolean) => {
    const event = navigation.emit({ type: 'tabPress', target: routeKey, canPreventDefault: true });
    if (!focused && !event.defaultPrevented) navigation.navigate(routeName);
  };

  if (sideNav) {
    const flight = ticket ? flightData.getFlight(ticket.flightId) : null;
    const origin = flight ? flightData.getAirport(flight.from) : null;
    return (
      // Fundalul e cerul partajat din spatele tab-urilor (SharedBackground): același ca la ecrane, fără cusătură
      <View style={[styles.sideWrap, { paddingTop: insets.top + spacing.sm, paddingBottom: insets.bottom + spacing.lg, paddingLeft: insets.left + spacing.lg }]}>
        <Glass radius={30} style={styles.side} accessibilityRole="tablist" accessibilityLabel={t('tabs.nav')}>
          <View style={styles.brand}>
            <BrandLogo size={36} />
            <AppText variant="headline">{t('app.name')}</AppText>
          </View>
          {state.routes.map((route, index) => {
            const tab = TABS[route.name]!;
            const focused = state.index === index;
            const Icon = tab.icon;
            return (
              <PressableScale
                key={route.key}
                onPress={() => go(route.key, route.name, focused)}
                style={[styles.sideItem, focused && styles.sideItemOn]}
                accessibilityRole="tab"
                accessibilityState={{ selected: focused }}
                accessibilityLabel={t(tab.label)}
              >
                <Icon size={21} color={focused ? colors.onAccent : colors.text2} />
                <AppText variant="headline" weight="700" color={focused ? colors.onAccent : colors.text2}>
                  {t(tab.label)}
                </AppText>
              </PressableScale>
            );
          })}
          {ticket && flight && origin && (
            <Glass tone="strong" radius={20} style={styles.sideTicket}>
              <AppText variant="label">{t('pass.title')}</AppText>
              <AppText variant="title">
                {ticket.pass.from} → {ticket.pass.to}
              </AppText>
              <AppText variant="caption" color={colors.text2}>
                {flight.carrier} {flight.flightNumber} · {formatLocalTime(flight.departureUtc, origin.utcOffsetMin)} · {ticket.pass.seat}
              </AppText>
            </Glass>
          )}
        </Glass>
      </View>
    );
  }

  // Telefon și tabletă portret: capsulă de sticlă care plutește deasupra conținutului
  const compact = sizeClass === 'compact';
  const centered = sizeClass === 'medium';
  return (
    <View
      pointerEvents="box-none"
      style={[styles.floatWrap, { bottom: insets.bottom + TAB_BAR_LIFT, left: insets.left + TAB_BAR_MARGIN, right: insets.right + TAB_BAR_MARGIN }]}
    >
      <Glass
        floating
        radius={TAB_BAR_HEIGHT / 2}
        style={[styles.bar, centered && styles.barCentered]}
        accessibilityRole="tablist"
        accessibilityLabel={t('tabs.nav')}
      >
        {state.routes.map((route, index) => {
          const tab = TABS[route.name]!;
          const focused = state.index === index;
          const Icon = tab.icon;
          return (
            <PressableScale
              key={route.key}
              onPress={() => go(route.key, route.name, focused)}
              style={[styles.tab, focused && styles.tabOn]}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={t(tab.label)}
            >
              <Icon size={compact ? 23 : 21} color={focused ? colors.accent : colors.text3} strokeWidth={focused ? 2.3 : 2} />
              {!compact && (
                <AppText variant="label" numberOfLines={1} color={focused ? colors.accent : colors.textMuted} style={styles.tabLabel}>
                  {t(tab.label)}
                </AppText>
              )}
            </PressableScale>
          );
        })}
      </Glass>
    </View>
  );
}

const styles = StyleSheet.create({
  // Deasupra cardurilor derulate: umbrele lor (boxShadow) le-ar putea desena peste bară pe Android
  floatWrap: { position: 'absolute', alignItems: 'center', zIndex: 10, elevation: 12 },
  bar: { backgroundColor: colors.glassBar, height: TAB_BAR_HEIGHT, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', paddingHorizontal: 6, alignSelf: 'stretch' },
  barCentered: { alignSelf: 'center', width: 480 },
  tab: { flex: 1, height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center', gap: 2 },
  // Pastila tab-ului activ: sticlă albastră cu o strălucire fină
  tabOn: { backgroundColor: colors.accentSoft, borderWidth: 1, borderColor: colors.accentLine, boxShadow: `0 2px 10px ${colors.shadowCard}` },
  tabLabel: { fontSize: 11, letterSpacing: 0, textTransform: 'none', fontWeight: '700' },
  sideWrap: { width: 264, paddingRight: 0 },
  side: { flex: 1, padding: spacing.md, gap: spacing.xs },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: spacing.sm, paddingBottom: spacing.md, paddingTop: spacing.xs },
  sideItem: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48, paddingHorizontal: 16, borderRadius: 24 },
  sideItemOn: { backgroundColor: colors.accent, boxShadow: `0 6px 16px ${colors.shadowGlow}` },
  sideTicket: { marginTop: 'auto', padding: spacing.md, gap: 2 },
});
