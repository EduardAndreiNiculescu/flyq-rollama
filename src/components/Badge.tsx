import type { LucideIcon } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';
import { colors, radii, spacing } from '../theme/tokens';
import { AppText } from './AppText';

export type BadgeTone = 'accent' | 'success' | 'warning' | 'danger' | 'neutral';

const TONES: Record<BadgeTone, { bg: string; fg: string }> = {
  accent: { bg: colors.accentSoft, fg: colors.accentText },
  success: { bg: colors.successSoft, fg: colors.successText },
  warning: { bg: colors.warningSoft, fg: colors.warningText },
  danger: { bg: colors.dangerSoft, fg: colors.danger },
  neutral: { bg: colors.line, fg: colors.text2 },
};

export function Badge({ label, tone = 'neutral', icon: Icon }: { label: string; tone?: BadgeTone; icon?: LucideIcon }) {
  const { bg, fg } = TONES[tone];
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      {Icon ? <Icon size={13} color={fg} strokeWidth={2} /> : null}
      <AppText variant="caption" color={fg} weight="700" numberOfLines={1}>
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    minHeight: 24,
    paddingHorizontal: spacing.sm + 1,
    borderRadius: radii.pill,
    alignSelf: 'flex-start',
  },
});
