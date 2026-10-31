import type { LucideIcon } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, radii, spacing, touchTarget } from '../theme/tokens';
import { AppText } from './AppText';
import { Glass } from './Glass';
import { PressableScale } from './press';

interface Props {
  label: string;
  onPress?: () => void;
  icon?: LucideIcon;
  /** primary = albastru plin; glass = sticlă; tinted = umplutură translucidă pentru acțiuni secundare; danger = roșu */
  variant?: 'primary' | 'glass' | 'tinted' | 'danger';
  size?: 'md' | 'sm';
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityHint?: string;
}

export function Button({ label, onPress, icon: Icon, variant = 'primary', size = 'md', disabled, style, accessibilityHint }: Props) {
  const height = size === 'md' ? 52 : touchTarget;
  const fg = variant === 'primary' ? colors.onAccent : variant === 'danger' ? colors.danger : variant === 'tinted' ? colors.accentText : colors.text;
  const content = (
    <View style={styles.row}>
      {Icon ? <Icon size={size === 'md' ? 20 : 17} color={fg} strokeWidth={2} /> : null}
      <AppText variant="headline" color={fg} weight="700" numberOfLines={2} align="center" style={size === 'sm' && styles.smallText}>
        {label}
      </AppText>
    </View>
  );

  return (
    <PressableScale
      onPress={onPress ? () => {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); // fără vibrație pe dispozitive care nu o au
        onPress();
      } : undefined}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!disabled }}
      style={[disabled && styles.disabled, style]}
    >
      {variant === 'primary' ? (
        <View style={[styles.base, styles.primary, { minHeight: height, borderRadius: height / 2 }]}>
          <View pointerEvents="none" style={styles.primaryGloss} />
          {content}
        </View>
      ) : variant === 'tinted' ? (
        <View style={[styles.base, styles.tinted, { minHeight: height, borderRadius: height / 2 }]}>{content}</View>
      ) : (
        <Glass radius={height / 2} style={[styles.base, { minHeight: height }, variant === 'danger' && styles.dangerBorder]}>
          {content}
        </Glass>
      )}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  disabled: { opacity: 0.5 },
  base: { borderCurve: 'continuous', justifyContent: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  // Butonul principal: albastru de sistem plin (fără gradient violet), cu o linie de luciu sus și o strălucire albastră dedesubt
  primary: { backgroundColor: colors.accent, overflow: 'hidden', borderCurve: 'continuous', boxShadow: `0 6px 16px ${colors.shadowCard}, 0 2px 6px rgba(46,91,255,0.25)` },
  primaryGloss: { position: 'absolute', top: 0, left: 16, right: 16, height: 1, backgroundColor: 'rgba(255,255,255,0.45)' },
  tinted: { backgroundColor: colors.fillSecondary, overflow: 'hidden' },
  dangerBorder: { backgroundColor: colors.dangerSoft, borderColor: colors.dangerLine, borderRadius: radii.pill },
  smallText: { fontSize: 15 },
});
