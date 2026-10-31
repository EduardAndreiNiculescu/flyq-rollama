import { useEffect } from 'react';
import { StyleSheet, View, type DimensionValue, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { useT } from '../i18n';
import { colors, radii, spacing } from '../theme/tokens';
import { Glass } from './Glass';

// Blocuri gri de aceeași formă ca și conținutul care urmează, ca layout-ul să nu sară.
// Pulsează doar opacitatea (fără shimmer); cu „reducerea mișcării” activă rămân statice.
export function SkeletonBlock({ width = '100%', height = 14, style }: { width?: DimensionValue; height?: number; style?: StyleProp<ViewStyle> }) {
  const reduceMotion = useReducedMotion();
  const opacity = useSharedValue(1);
  useEffect(() => {
    if (!reduceMotion) opacity.value = withRepeat(withTiming(0.45, { duration: 800 }), -1, true);
  }, [opacity, reduceMotion]);
  const pulse = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return <Animated.View style={[styles.block, { width, height, borderRadius: Math.min(height / 2, radii.md) }, pulse, style]} />;
}

/** Card de schelet: un titlu și câteva rânduri, în aceeași sticlă ca și cardul real. */
export function SkeletonCard({ lines = 3, height }: { lines?: number; height?: number }) {
  const t = useT();
  return (
    <Glass style={[styles.card, height ? { minHeight: height } : null]} accessible accessibilityLabel={t('common.loading')} accessibilityRole="progressbar">
      <SkeletonBlock width="45%" height={18} />
      {Array.from({ length: lines }, (_, i) => (
        <SkeletonBlock key={i} width={i === lines - 1 ? '60%' : '100%'} />
      ))}
    </Glass>
  );
}

/** Ecranul de pornire, cât se citesc biletele salvate: banda, bannerul și lista de pași. */
export function SkeletonScreen() {
  return (
    <View style={styles.screen}>
      <SkeletonCard lines={1} />
      <SkeletonCard lines={2} height={110} />
      <SkeletonCard lines={6} height={360} />
    </View>
  );
}

const styles = StyleSheet.create({
  block: { backgroundColor: colors.progressTrack },
  card: { padding: spacing.lg, gap: spacing.md },
  screen: { gap: spacing.md },
});
