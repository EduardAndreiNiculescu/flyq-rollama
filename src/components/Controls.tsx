import type { LucideIcon } from 'lucide-react-native';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { colors, spacing } from '../theme/tokens';
import { AppText } from './AppText';
import { Glass } from './Glass';
import { PressableScale } from './press';

// ───────── Chip (filtre, sugestii) ─────────

export function Chip({
  label,
  icon: Icon,
  selected,
  onPress,
}: {
  label: string;
  icon?: LucideIcon;
  selected?: boolean;
  onPress?: () => void;
}) {
  const fg = selected ? colors.onAccent : colors.text;
  const inner = (
    <View style={styles.chipRow}>
      {Icon ? <Icon size={16} color={fg} /> : null}
      <AppText variant="caption" color={fg} weight="700" numberOfLines={1}>
        {label}
      </AppText>
    </View>
  );
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: !!selected }}
      // Chip-ul arată 38 pt, dar zona de atingere are 48
      hitSlop={{ top: 5, bottom: 5 }}
     
    >
      {selected ? (
        <View style={[styles.chip, styles.chipOn]}>{inner}</View>
      ) : (
        <Glass radius={19} style={styles.chip}>
          {inner}
        </Glass>
      )}
    </PressableScale>
  );
}

// ───────── Toggle ─────────

export function Toggle({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label: string }) {
  const x = useSharedValue(value ? 1 : 0);
  useEffect(() => {
    x.value = withTiming(value ? 1 : 0, { duration: 180 });
  }, [value, x]);
  const knob = useAnimatedStyle(() => ({ transform: [{ translateX: x.value * 20 }] }));
  return (
    <PressableScale
      onPress={() => onChange(!value)}
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: value }}
      hitSlop={8}
    >
      <View style={[styles.track, value && styles.trackOn]}>
        <Animated.View style={[styles.knob, knob]} />
      </View>
    </PressableScale>
  );
}

// ───────── Segmented ─────────

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string; icon?: LucideIcon }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <Glass radius={22} style={styles.seg} accessibilityRole="radiogroup">
      {options.map(opt => {
        const on = opt.value === value;
        const Icon = opt.icon;
        return (
          <PressableScale
            key={opt.value}
            onPress={() => onChange(opt.value)}
            style={[styles.segItem, on && styles.segOn]}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            accessibilityLabel={opt.label}
          >
            {Icon ? <Icon size={16} color={on ? colors.text : colors.text2} /> : null}
            <AppText variant="caption" color={on ? colors.text : colors.text2} weight="700" numberOfLines={1}>
              {opt.label}
            </AppText>
          </PressableScale>
        );
      })}
    </Glass>
  );
}

// ───────── Icon tile ─────────

export function IconTile({
  icon: Icon,
  tone = 'soft',
  size = 42,
}: {
  icon: LucideIcon;
  tone?: 'soft' | 'accent' | 'plain' | 'warning' | 'success' | 'indigo' | 'violet';
  size?: number;
}) {
  const bg = {
    soft: colors.accentSoft,
    accent: colors.accent,
    plain: colors.tilePlain,
    warning: colors.warning,
    success: colors.success,
    indigo: colors.indigoSoft,
    violet: colors.violetSoft,
  }[tone];
  const fg =
    tone === 'soft' ? colors.accentText : tone === 'indigo' ? colors.accentIndigo : tone === 'violet' ? colors.accentViolet : tone === 'plain' ? colors.text : colors.white;
  return (
    <View style={[styles.tile, { width: size, height: size, borderRadius: size * 0.33, backgroundColor: bg }]} importantForAccessibility="no" accessibilityElementsHidden>
      <Icon size={size * 0.48} color={fg} strokeWidth={2} />
    </View>
  );
}

// ───────── Progress bar ─────────

export function ProgressBar({ value, height = 8, dim }: { value: number; height?: number; dim?: boolean }) {
  const w = useSharedValue(value);
  useEffect(() => {
    w.value = withTiming(Math.max(0, Math.min(1, value)), { duration: 400 });
  }, [value, w]);
  // Bara plină e mutată spre stânga cu translateX (doar transform, fluid și pe telefoane vechi).
  // Capătul rotunjit rămâne intact, iar la procente mici se vede cel puțin o capsulă cât înălțimea.
  const trackWidth = useSharedValue(0);
  const fill = useAnimatedStyle(() => {
    const min = trackWidth.value > 0 ? Math.min(1, height / trackWidth.value) : 0;
    const visible = w.value > 0 ? Math.max(w.value, min) : 0;
    return { transform: [{ translateX: -(1 - visible) * trackWidth.value }] };
  });
  return (
    <View
      onLayout={e => (trackWidth.value = e.nativeEvent.layout.width)}
      style={[styles.progress, { height, borderRadius: height / 2 }]}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(value * 100) }}
    >
      <Animated.View style={[styles.progressFill, { borderRadius: height / 2, opacity: dim ? 0.5 : 1 }, fill]} />
    </View>
  );
}

const styles = StyleSheet.create({
  chip: { minHeight: 38, paddingHorizontal: spacing.md, justifyContent: 'center' },
  chipOn: { backgroundColor: colors.accent, borderRadius: 19, borderWidth: 1, borderColor: colors.accent },
  chipRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  track: { width: 52, height: 32, borderRadius: 16, backgroundColor: colors.trackOff, padding: 3 },
  trackOn: { backgroundColor: colors.accent },
  knob: { width: 26, height: 26, borderRadius: 13, backgroundColor: colors.white, boxShadow: `0 1px 3px ${colors.shadowKnob}` },
  seg: { flexDirection: 'row', padding: 4, gap: 4 },
  segItem: { flex: 1, minHeight: 44, borderRadius: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: spacing.sm },
  segOn: { backgroundColor: colors.white },
  tile: { alignItems: 'center', justifyContent: 'center' },
  progress: { backgroundColor: colors.progressTrack, overflow: 'hidden', flex: 1, minHeight: 6 },
  progressFill: { width: '100%', height: '100%', backgroundColor: colors.accent },
});

