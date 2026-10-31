import { Clock, DoorOpen } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInUp, FadeOutUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLanguage } from '../i18n';
import { useFlightStatus } from '../store/flightStatus';
import { colors, radii, spacing } from '../theme/tokens';
import { AppText } from './AppText';
import { Glass } from './Glass';

const SHOW_MS = 8000;

/** Slides in for a few seconds when the FlyQ server changes the gate or a delay, so the change is visible whichever screen is open. */
export function FlightChangeBanner() {
  const ro = useLanguage() === 'ro';
  const insets = useSafeAreaInsets();
  const change = useFlightStatus(s => s.lastChange);
  const [shownId, setShownId] = useState<number | null>(null);

  useEffect(() => {
    if (!change || Date.now() - change.at > SHOW_MS) return;
    setShownId(change.id);
    const t = setTimeout(() => setShownId(null), SHOW_MS);
    return () => clearTimeout(t);
  }, [change]);

  if (!change || shownId !== change.id) return null;
  const gate = change.kind === 'gate';
  const text = gate
    ? change.from
      ? ro ? `Poarta s-a schimbat: ${change.from} → ${change.to}` : `Gate changed: ${change.from} → ${change.to}`
      : ro ? `Poarta ta: ${change.to}` : `Your gate: ${change.to}`
    : ro ? `Întârziere: ${change.to} min` : `Delay: ${change.to} min`;
  const Icon = gate ? DoorOpen : Clock;
  return (
    <View pointerEvents="none" style={[styles.wrap, { top: insets.top + spacing.sm }]}>
      <Animated.View entering={FadeInUp.duration(280)} exiting={FadeOutUp.duration(240)}>
        <Glass tone="strong" floating radius={radii.pill} style={styles.pill}>
          <Icon size={20} color={colors.accent} strokeWidth={2.2} />
          <AppText variant="headline" numberOfLines={1}>{text}</AppText>
        </Glass>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: spacing.lg, right: spacing.lg, alignItems: 'center', zIndex: 50 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, backgroundColor: colors.glassSolid },
});
