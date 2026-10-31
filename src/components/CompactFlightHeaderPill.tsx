import { ChevronRight, Plane } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';
import { useT } from '../i18n';
import { useLayout } from '../theme/responsive';
import { colors, radii, spacing } from '../theme/tokens';
import { AppText } from './AppText';
import { Glass } from './Glass';

interface Props {
  from: string;
  to: string;
  /** Codul zborului, de ex. „W6 3541” */
  flight: string;
  gate: string;
  departure: string;
  /** Săgeata din dreapta: pastila deschide ceva la atingere */
  chevron?: boolean;
}

// Pastila de sticlă cu zborul, sus pe ecran: ruta mare cu zborul dedesubt, apoi poarta și ora de
// plecare ca cifre mari, fiecare cu eticheta ei.
export function CompactFlightHeaderPill({ from, to, flight, gate, departure, chevron }: Props) {
  const t = useT();
  const { sizeClass } = useLayout();
  const compact = sizeClass === 'compact';
  return (
    <Glass tone="strong" floating radius={radii.pill} style={styles.pill}>
      <View style={styles.plane}>
        <Plane size={22} color={colors.onAccent} strokeWidth={2.3} />
      </View>
      <View style={styles.route}>
        <AppText variant="title" numberOfLines={1} adjustsFontSizeToFit style={styles.big}>
          {from} → {to}
        </AppText>
        <AppText variant="caption" color={colors.textMuted} numberOfLines={1}>
          {flight}
        </AppText>
      </View>
      <View style={styles.cell}>
        <AppText variant="label">{t('pass.gate')}</AppText>
        <AppText variant="title" color={colors.accentText} style={styles.big}>
          {gate}
        </AppText>
      </View>
      <View style={[styles.cell, styles.divider]}>
        <AppText variant="label">{t('flight.departure')}</AppText>
        <AppText variant="title" tabular style={styles.big}>
          {departure}
        </AppText>
      </View>
      {chevron && !compact ? <ChevronRight size={20} color={colors.text3} /> : null}
    </Glass>
  );
}

const styles = StyleSheet.create({
  // Aproape opacă: cardurile derulate trec pe sub pastilă și textul lor nu trebuie să se vadă prin ea
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 78,
    paddingLeft: 12,
    paddingRight: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: colors.glassSolid,
  },
  plane: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
    boxShadow: `0 4px 12px ${colors.shadowGlow}`,
  },
  route: { flex: 1, minWidth: 0 },
  big: { lineHeight: 30 },
  cell: { alignItems: 'center' },
  divider: { paddingLeft: spacing.md, borderLeftWidth: 1, borderLeftColor: colors.lineVertical },
});
