import {
  ArrowUp,
  CircleCheck,
  CornerUpLeft,
  CornerUpRight,
  Footprints,
  Hourglass,
  MapPinOff,
  TriangleAlert,
  Undo2,
  type LucideIcon,
} from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useLocalized, useT } from '../../i18n';
import { nextInstruction, type Instruction } from '../../lib/instructions';
import { terminalService } from '../../services';
import { useIndoorNav } from '../../store/indoorNav';
import { useSettings } from '../../store/settings';
import { useLayout } from '../../theme/responsive';
import { colors, radii, spacing } from '../../theme/tokens';
import { AppText } from '../AppText';
import { BottomSheet } from '../BottomSheet';
import { IconTile, ProgressBar } from '../Controls';
import { Glass } from '../Glass';
import { pressFeedback } from '../press';
import { ErrorBanner } from '../ErrorBanner';
import { EmptyState } from '../Layout';
import { FlyQLoader } from '../brand/FlyQLoader';
import { MapPlaceholder } from './MapPlaceholder';

const WALK_SPEED_MS = 1.3;

interface Props {
  targetNodeId: string;
  showDebug: boolean;
  onFloorLabel?: (label: string) => void;
}

// Harta + instrucțiunea următoare. Desenul hărții e un placeholder (vezi MapPlaceholder);
// ruta, poziția și instrucțiunile funcționează deja și vin din store-ul indoorNav.
export function MapPanel({ targetNodeId, showDebug, onFloorLabel }: Props) {
  const t = useT();
  const localized = useLocalized();
  const { sizeClass } = useLayout();
  const avoidStairs = useSettings(s => s.avoidStairs);
  const { route, position, graph, error, navigateTo, simulateDeviation, setSpeed, speedMultiplier } = useIndoorNav();
  const currentTarget = useIndoorNav(s => s.targetNodeId);
  // Etajul ales manual rămâne valabil doar cât utilizatorul e pe același etaj (derivat, fără efect)
  const [manual, setManual] = useState<{ floor: number; userFloor: number } | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  // Cât se încarcă harta, loader-ul FlyQ stă peste ea și se estompează când harta anunță că e gata
  const [mapReady, setMapReady] = useState(false);
  const onMapReady = useCallback(() => setMapReady(true), []);

  const terminal = useMemo(() => {
    try {
      // reloadKey crește la „Reîncearcă” și forțează o nouă citire a terminalului
      return reloadKey >= 0 ? terminalService.getTerminal() : null;
    } catch {
      return null;
    }
  }, [reloadKey]);

  useEffect(() => {
    if (currentTarget !== targetNodeId || !route) navigateTo(targetNodeId, avoidStairs);
    // Recalculăm doar când se schimbă destinația sau preferința pentru lift
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetNodeId, avoidStairs]);

  const userFloor = position?.floor ?? route?.points[0]?.floor ?? 0;
  const floor = manual && manual.userFloor === userFloor ? manual.floor : userFloor;
  const floorInfo = terminal?.floors.find(f => f.id === floor);
  const targetLabel = localized(terminal?.nodes.find(n => n.id === targetNodeId)?.landmark);
  useEffect(() => {
    if (floorInfo) onFloorLabel?.(localized(floorInfo.name));
  }, [floorInfo, localized, onFloorLabel]);

  if (!terminal) {
    return (
      <EmptyState
        icon={MapPinOff}
        tone="warning"
        title={t('map.error.title')}
        body={t('map.error.body')}
        actionLabel={t('common.retry')}
        onAction={() => setReloadKey(k => k + 1)}
      />
    );
  }

  const waiting = position?.status === 'still' && (position.progressM ?? 0) > 1;
  const instruction: Instruction | null = route && graph ? nextInstruction(route, position?.progressM ?? 0, graph.nodes, waiting) : null;
  const remainingM = route ? Math.max(0, route.lengthM - (position?.progressM ?? 0)) : 0;
  const progress = route ? (position?.progressM ?? 0) / route.lengthM : 0;
  const offRoute = position?.status === 'offRoute';
  const remainingMin = remainingM < 1 ? 0 : Math.max(1, Math.round(remainingM / WALK_SPEED_MS / 60));

  return (
    <View style={styles.fill}>
      <View style={styles.mapArea}>
        <MapPlaceholder floor={floor} route={route} position={position} targetNodeId={targetNodeId} showDebug={showDebug} onReady={onMapReady} />
        {!mapReady && <FlyQLoader variant="panel" label={t('loader.map')} />}

        {offRoute && (
          <Animated.View entering={FadeIn} exiting={FadeOut} style={styles.offRoute} accessibilityLiveRegion="assertive">
            <TriangleAlert size={18} color={colors.warning} />
            <AppText variant="caption" color={colors.warningText} weight="700" style={styles.flex}>
              {t('map.offRoute')}
            </AppText>
          </Animated.View>
        )}

        <Glass radius={24} style={styles.floors} accessibilityRole="radiogroup" accessibilityLabel={t('map.floors')}>
          {[...terminal.floors].reverse().map(f => (
            <Pressable
              key={f.id}
              onPress={() => setManual({ floor: f.id, userFloor })}
              style={pressFeedback([styles.floorBtn, f.id === floor && styles.floorBtnOn])}
              accessibilityRole="radio"
              accessibilityState={{ selected: f.id === floor }}
              accessibilityLabel={t('map.floorButton', { floor: f.id })}
            >
              <AppText variant="headline" color={f.id === floor ? colors.onAccent : colors.text}>
                {f.id}
              </AppText>
            </Pressable>
          ))}
        </Glass>

        {showDebug && (
          <View style={styles.debugRow}>
            <Pressable onPress={simulateDeviation} style={pressFeedback(styles.debugBtn)} accessibilityRole="button">
              <AppText variant="caption" color={colors.white}>{t('map.debug.deviate')}</AppText>
            </Pressable>
            <Pressable onPress={() => setSpeed(speedMultiplier >= 8 ? 1 : speedMultiplier * 2)} style={pressFeedback(styles.debugBtn)} accessibilityRole="button">
              <AppText variant="caption" color={colors.white}>{t('map.debug.speed', { speed: speedMultiplier })}</AppText>
            </Pressable>
          </View>
        )}
      </View>

      {error === 'noRoute' ? (
        <ErrorBanner message={t('map.noRoute')} retryLabel={t('common.retry')} onRetry={() => navigateTo(targetNodeId, avoidStairs)} />
      ) : instruction ? (
        <BottomSheet style={sizeClass === 'expanded' ? styles.sheetWide : undefined}>
          <InstructionView instruction={offRoute ? { kind: 'back' } : instruction} />
          {/* Distanța și timpul rămase pe două coloane; pe ecrane foarte înguste rămâne doar bara */}
          <View style={styles.hairline} />
          {sizeClass !== 'compact' && (
            <View style={styles.foot}>
              <View style={styles.flex}>
                <AppText variant="label">{t('map.remainingDist')}</AppText>
                <AppText variant="headline" tabular>{Math.round(remainingM)} m</AppText>
              </View>
              <View style={styles.flex}>
                <AppText variant="label">{t('map.eta')}</AppText>
                <AppText variant="headline" tabular>~{remainingMin} {t('common.min')}</AppText>
              </View>
            </View>
          )}
          <ProgressBar value={progress} />
        </BottomSheet>
      ) : (
        <FlyQLoader variant="inline" message={t('loader.route', { target: targetLabel })} />
      )}
    </View>
  );
}

function InstructionView({ instruction }: { instruction: Instruction | { kind: 'back' } }) {
  const t = useT();
  const localized = useLocalized();
  let icon: LucideIcon = ArrowUp;
  let tone: 'accent' | 'warning' | 'success' = 'accent';
  let title = '';
  let subtitle = '';
  switch (instruction.kind) {
    case 'turn':
      icon = instruction.dir === 'left' ? CornerUpLeft : CornerUpRight;
      title = t('map.instr.turn', { dist: Math.round(instruction.distM), dir: t(instruction.dir === 'left' ? 'map.left' : 'map.right') });
      subtitle = instruction.landmark ? t('map.instr.towards', { landmark: localized(instruction.landmark) }) : '';
      break;
    case 'straight':
      title = t('map.instr.straight', { dist: Math.round(instruction.distM) });
      subtitle = instruction.landmark ? t('map.instr.towards', { landmark: localized(instruction.landmark) }) : '';
      break;
    case 'floor':
      icon = Footprints;
      title = t('map.instr.floor', { floor: instruction.floor });
      subtitle = instruction.via ? t('map.instr.floorVia', { via: localized(instruction.via) }) : '';
      break;
    case 'wait':
      icon = Hourglass;
      title = t('map.instr.wait', { landmark: instruction.landmark ? localized(instruction.landmark) : '' });
      subtitle = t('map.instr.waitSub');
      break;
    case 'arrived':
      icon = CircleCheck;
      tone = 'success';
      title = t('map.instr.arrived');
      subtitle = instruction.landmark ? t('map.instr.arrivedAt', { landmark: localized(instruction.landmark) }) : '';
      break;
    case 'back':
      icon = Undo2;
      tone = 'warning';
      title = t('map.instr.back', { dist: 7 });
      subtitle = t('map.instr.backSub');
      break;
  }
  return (
    <View style={styles.instr} accessible accessibilityLiveRegion="polite" accessibilityLabel={`${title}. ${subtitle}`}>
      <IconTile icon={icon} tone={tone} size={54} />
      <View style={styles.flex}>
        <AppText variant="title">{title}</AppText>
        {subtitle ? <AppText variant="caption" color={colors.text2}>{subtitle}</AppText> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, gap: spacing.md },
  flex: { flex: 1 },
  mapArea: { flex: 1, minHeight: 200 },
  offRoute: { position: 'absolute', left: spacing.md, right: 72, top: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, borderRadius: radii.lg, backgroundColor: colors.warningGlass, borderWidth: 1.5, borderColor: colors.warning },
  floors: { position: 'absolute', right: spacing.md, top: spacing.md, padding: 4, gap: 2 },
  floorBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  floorBtnOn: { backgroundColor: colors.accent, boxShadow: `0 4px 12px ${colors.shadowGlow}` },
  debugRow: { position: 'absolute', left: spacing.md, bottom: spacing.md, flexDirection: 'row', gap: 6 },
  debugBtn: { paddingHorizontal: spacing.md, minHeight: 44, justifyContent: 'center', borderRadius: 12, backgroundColor: colors.overlay },
  sheetWide: { maxWidth: 520 },
  instr: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  hairline: { height: 1, backgroundColor: colors.line, marginVertical: spacing.md },
  foot: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.md },
});
