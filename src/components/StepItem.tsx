import type { LucideIcon } from 'lucide-react-native';
import { Check } from 'lucide-react-native';
import { useEffect, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  LinearTransition,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useT } from '../i18n';
import { colors, spacing } from '../theme/tokens';
import { AppText } from './AppText';

export type StepStatus = 'done' | 'current' | 'next' | 'skipped';

interface Props {
  icon: LucideIcon;
  title: string;
  meta: string;
  status: StepStatus;
  right?: ReactNode;
  last?: boolean;
  children?: ReactNode;
}

export function StepItem({ icon: Icon, title, meta, status, right, last, children }: Props) {
  const t = useT();
  const statusLabel = t(
    status === 'done' ? 'step.status.done' : status === 'current' ? 'step.status.current' : status === 'skipped' ? 'step.status.skipped' : 'step.status.next',
  );
  const DotIcon = status === 'done' ? Check : Icon;
  return (
    <Animated.View layout={LinearTransition.duration(250)} style={styles.step} accessible accessibilityLabel={`${title}, ${statusLabel}. ${meta}`}>
      <View style={styles.rail}>
        {status === 'current' && <PulseRing />}
        <View style={[styles.dot, dotStyles[status]]}>
          <DotIcon size={15} strokeWidth={2} color={status === 'done' || status === 'current' ? colors.white : colors.text3} />
        </View>
        {!last && <View style={[styles.line, status === 'done' && styles.lineDone, status === 'current' && styles.lineCurrent, (status === 'next' || status === 'skipped') && styles.lineNext]} />}
      </View>
      <View style={styles.body}>
        <View style={styles.titleRow}>
          <AppText variant="headline" color={status === 'skipped' ? colors.text2 : colors.text} style={styles.title}>
            {title}
          </AppText>
          {right}
        </View>
        <AppText variant="caption" weight="400" color={colors.text2}>
          {meta}
        </AppText>
        {children && <Animated.View entering={FadeIn.duration(250)}>{children}</Animated.View>}
      </View>
    </Animated.View>
  );
}

// Inelul care pulsează în jurul pasului curent (1 → 1,18, 1,4 s, dus-întors); oprit la mișcare redusă.
// Pulsează două cicluri, apoi stă liniștit și mai pulsează o dată la 20 s: o animație continuă ținea ecranul
// la 60 fps chiar când nu se întâmpla nimic (baterie, căldură).
const PULSE_EVERY_MS = 20_000;
function PulseRing() {
  const reduceMotion = useReducedMotion();
  const p = useSharedValue(0);
  useEffect(() => {
    if (reduceMotion) return;
    const burst = () => {
      p.value = 0;
      p.value = withRepeat(withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.sin) }), 4, true);
    };
    burst();
    const id = setInterval(burst, PULSE_EVERY_MS);
    return () => clearInterval(id);
  }, [p, reduceMotion]);
  const style = useAnimatedStyle(() => ({ opacity: 0.55 - 0.35 * p.value, transform: [{ scale: 1 + 0.18 * p.value }] }));
  return <Animated.View pointerEvents="none" style={[styles.ring, style]} />;
}

const styles = StyleSheet.create({
  step: { flexDirection: 'row', gap: spacing.md },
  rail: { alignItems: 'center', width: 32 },
  dot: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute', top: -5, width: 40, height: 40, borderRadius: 20, backgroundColor: colors.accentSoft, borderWidth: 1, borderColor: colors.accentLine },
  line: { flex: 1, width: 2, minHeight: 10, marginVertical: 3, borderRadius: 1, backgroundColor: colors.line },
  lineDone: { backgroundColor: colors.success },
  lineCurrent: { backgroundColor: colors.accent },
  // Pașii care urmează: linie punctată, ca drumul încă neparcurs
  lineNext: { width: 0, borderLeftWidth: 2, borderStyle: 'dashed', borderColor: colors.text3, backgroundColor: 'transparent' },
  body: { flex: 1, paddingTop: 4, paddingBottom: spacing.md, gap: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, flexWrap: 'wrap' },
  title: { flexShrink: 1 },
});

const dotStyles = StyleSheet.create({
  done: { backgroundColor: colors.success, boxShadow: `0 3px 8px ${colors.successGlow}` },
  current: { backgroundColor: colors.accent, boxShadow: `0 4px 12px ${colors.shadowGlow}` },
  // Nod de sticlă: alb translucid cu contur luminos
  next: { backgroundColor: colors.glassStrong, borderWidth: 1.5, borderColor: colors.glassEdgeLit, boxShadow: `0 2px 6px ${colors.shadowCard}` },
  skipped: { borderWidth: 1.5, borderColor: colors.line, borderStyle: 'dashed' },
});
