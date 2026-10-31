import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { colors, spacing } from '../theme/tokens';
import { AppText } from './AppText';
import { Glass } from './Glass';

interface Props {
  label: string;
  value: string;
  unit?: string;
  hint?: string;
  /** Valoare estimată: textul devine secundar */
  estimated?: boolean;
}

export const StatTile = memo(function StatTileView({ label, value, unit, hint, estimated }: Props) {
  return (
    <Glass tone="strong" style={styles.tile} accessible accessibilityLabel={`${label}: ${value} ${unit ?? ''}. ${hint ?? ''}`}>
      <AppText variant="label" numberOfLines={1}>
        {label}
      </AppText>
      <View style={styles.valueRow}>
        <AppText variant="countdown" tabular color={estimated ? colors.text2 : colors.text} numberOfLines={1} adjustsFontSizeToFit style={styles.value}>
          {value}
        </AppText>
        {unit ? (
          <AppText variant="headline" color={colors.textMuted} style={styles.unit}>
            {unit}
          </AppText>
        ) : null}
      </View>
      {hint ? (
        <AppText variant="caption" color={colors.textMuted} weight="400" numberOfLines={2}>
          {hint}
        </AppText>
      ) : null}
    </Glass>
  );
});

const styles = StyleSheet.create({
// Celulă din grila de telemetrie: etichetă mică, cifră mare (800), unitate și o notă estompată
  tile: { flex: 1, paddingHorizontal: spacing.lg, paddingVertical: spacing.lg, gap: 4, minWidth: 140 },
  valueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 3 },
  value: { flexShrink: 1, fontSize: 32, letterSpacing: -1 },
  unit: { marginBottom: 2 },
});
