import { Map as MapIcon } from 'lucide-react-native';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { useT } from '../../i18n';
import { colors, spacing } from '../../theme/tokens';
import type { IndoorPosition, Route } from '../../types';
import { AppText } from '../AppText';
import { IconTile } from '../Controls';
import { Glass } from '../Glass';

/**
 * Locul hărții indoor. Harta reală se integrează separat: o componentă nouă cu aceleași props
 * înlocuiește acest placeholder în MapPanel, fără alte schimbări în ecrane.
 *
 * - `floor`: etajul afișat (urmărește etajul utilizatorului până alege altul)
 * - `route`: ruta A* curentă (puncte în metri, din terminal.json), sau null
 * - `position`: ultima poziție de la IndoorPositionService ({ x, y, floor, sigma, status })
 * - `targetNodeId`: nodul destinație din terminal.json
 */
export interface IndoorMapProps {
  floor: number;
  route: Route | null;
  position: IndoorPosition | null;
  targetNodeId: string;
  showDebug: boolean;
  /** Harta anunță că planul e desenat; până atunci MapPanel arată loader-ul FlyQ peste ea */
  onReady?: () => void;
}

export function MapPlaceholder({ floor, route, position, showDebug, onReady }: IndoorMapProps) {
  const t = useT();
  // Placeholder-ul imită încărcarea planului; harta reală apelează onReady când e desenată
  useEffect(() => {
    const id = setTimeout(() => onReady?.(), 900);
    return () => clearTimeout(id);
  }, [onReady]);
  return (
    <Glass style={styles.box} accessible accessibilityLabel={t('map.placeholder.title')}>
      <IconTile icon={MapIcon} size={56} />
      <AppText variant="headline" align="center">
        {t('map.placeholder.title')}
      </AppText>
      <AppText variant="caption" weight="400" color={colors.text2} align="center" style={styles.body}>
        {t('map.placeholder.body')}
      </AppText>
      <View style={styles.facts}>
        <AppText variant="caption" color={colors.text2} tabular>
          {t('common.floor', { floor })}
          {route ? ` · ${t('map.placeholder.route', { points: route.points.length, length: Math.round(route.lengthM) })}` : ''}
        </AppText>
      </View>
      {showDebug && position && (
        <View style={styles.debug}>
          <AppText variant="caption" color={colors.debugText} style={styles.mono}>
            {`x ${position.x.toFixed(1)} m  y ${position.y.toFixed(1)} m\nσ ${position.sigma.toFixed(1)} m  ${t('common.floor', { floor: position.floor })}\nstatus ${position.status}  s ${position.progressM.toFixed(1)} m`}
          </AppText>
        </View>
      )}
    </Glass>
  );
}

const styles = StyleSheet.create({
  box: { flex: 1, minHeight: 200, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, padding: spacing.xl, borderStyle: 'dashed', borderColor: colors.accent, borderWidth: 1.5 },
  body: { maxWidth: 320 },
  facts: { marginTop: spacing.xs },
  debug: { marginTop: spacing.sm, padding: spacing.md, borderRadius: 12, backgroundColor: colors.overlay },
  mono: { fontFamily: 'monospace', lineHeight: 18 },
});
