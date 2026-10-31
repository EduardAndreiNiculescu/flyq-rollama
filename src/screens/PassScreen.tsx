import { CommonActions, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { ChevronLeft, CircleCheck, Plane, Route as RouteIcon } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, ZoomIn } from 'react-native-reanimated';
import Svg, { Rect } from 'react-native-svg';
import type { RootStackParamList } from '../app/navigation';
import { AppText } from '../components/AppText';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { Glass } from '../components/Glass';
import { EmptyState, RoundButton, Screen, ScrollScreen, ScreenHeader } from '../components/Layout';
import { useLanguage, useT } from '../i18n';
import { maskPnr } from '../lib/bcbp';
import { formatDuration, formatLocalTime, formatLongDate, minutesBetween } from '../lib/time';
import { flightData } from '../services';
import { useTickets } from '../store/tickets';
import { useLayout } from '../theme/responsive';
import { colors, radii, spacing } from '../theme/tokens';

// Biletul în stil Wallet: compania, ruta mare, rândul principal (poartă, îmbarcare, loc),
// pasagerul, linia perforată cu decupaje și codul de bare (schița 02_BiletulTauSketch).
export function PassScreen() {
  const t = useT();
  const language = useLanguage();
  const navigation = useNavigation();
  const { params } = useRoute<RouteProp<RootStackParamList, 'Pass'>>();
  const ticket = useTickets(s => s.tickets.find(x => x.id === params.ticketId));
  const { type, sizeClass } = useLayout();

  const flight = ticket ? flightData.getFlight(ticket.flightId) : null;
  const from = flight ? flightData.getAirport(flight.from) : null;
  const to = flight ? flightData.getAirport(flight.to) : null;

  if (!ticket || !flight || !from || !to) {
    return (
      <Screen bottomInset="safeArea">
        <EmptyState icon={Plane} title={t('journey.empty.title')} body={t('journey.empty.body')} actionLabel={t('common.back')} onAction={() => navigation.goBack()} />
      </Screen>
    );
  }

  const start = () =>
    navigation.dispatch(CommonActions.reset({ index: 0, routes: [{ name: 'Main', params: { screen: 'Flight' } }] }));
  const codeSize = sizeClass === 'compact' ? 40 : type.display.fontSize;

  return (
    <ScrollScreen bottomInset="safeArea" column="columnNarrow">
      <ScreenHeader
        title={t('pass.title')}
        subtitle={formatLongDate(flight.departureUtc, from.utcOffsetMin, language)}
        right={params.justAdded ? undefined : <RoundButton icon={ChevronLeft} label={t('common.back')} onPress={() => navigation.goBack()} />}
      />
      {params.justAdded && (
        <Animated.View entering={ZoomIn.duration(300)}>
          <Glass radius={radii.pill} style={styles.toast}>
            <CircleCheck size={20} color={colors.success} />
            <AppText variant="headline" color={colors.successText} style={styles.flex}>
              {t('pass.added')}
            </AppText>
          </Glass>
        </Animated.View>
      )}

      <Animated.View entering={FadeInDown.duration(380)}>
        <Glass tone="strong" radius={radii.hero} style={styles.pass}>
          <View style={styles.top}>
            {/* Compania: inițiala într-o pastilă, numele și zborul; aeronava ca insignă */}
            <View style={styles.airline}>
              <View style={styles.carrierMark}>
                <AppText variant="headline" color={colors.onAccent}>
                  {flight.carrierName.charAt(0)}
                </AppText>
              </View>
              <AppText variant="caption" color={colors.text2} numberOfLines={1} style={styles.flex}>
                <AppText variant="caption" weight="700">{flight.carrierName}</AppText> · {flight.carrier} {flight.flightNumber}
              </AppText>
              <Badge label={flight.aircraft.replace('Airbus ', '')} />
            </View>

            <View style={styles.route}>
              <View style={styles.end}>
                <AppText variant="display" style={{ fontSize: codeSize }}>{from.code}</AppText>
                <AppText variant="caption" color={colors.textMuted}>{from.city}</AppText>
                <AppText variant="caption" weight="700" tabular>{formatLocalTime(flight.departureUtc, from.utcOffsetMin)}</AppText>
              </View>
              <View style={styles.mid}>
                <View style={styles.path}>
                  <View style={styles.dash} />
                  <View style={styles.planeDot}>
                    <Plane size={16} color={colors.onAccent} strokeWidth={2.4} />
                  </View>
                  <View style={styles.dash} />
                </View>
                <AppText variant="caption" color={colors.textMuted}>
                  {formatDuration(minutesBetween(flight.departureUtc, flight.arrivalUtc), language)}
                </AppText>
              </View>
              <View style={[styles.end, styles.endRight]}>
                <AppText variant="display" style={{ fontSize: codeSize }}>{to.code}</AppText>
                <AppText variant="caption" color={colors.textMuted} align="right">{to.city}</AppText>
                <AppText variant="caption" weight="700" tabular>{formatLocalTime(flight.arrivalUtc, to.utcOffsetMin)}</AppText>
              </View>
            </View>

            {/* Rândul principal, pe o sub-placă de sticlă: poarta și locul mari, îmbarcarea la mijloc */}
            <View style={styles.metrics}>
              <Metric label={t('pass.gate')} value={flight.gate} hero />
              <View style={styles.vline} />
              <Metric label={t('pass.boarding')} value={formatLocalTime(flight.boardingUtc, from.utcOffsetMin)} />
              <View style={styles.vline} />
              <Metric label={t('pass.seat')} value={ticket.pass.seat} hero />
            </View>

            <View style={styles.secondary}>
              <Info label={t('pass.passenger')} value={ticket.pass.passengerName} wide />
              <Info label={t('pass.group')} value={String(ticket.boardingGroup)} />
              <Info label={t('pass.pnr')} value={maskPnr(ticket.pass.pnr)} />
            </View>
          </View>

          <Perforation />

          <View style={styles.barcodeWrap}>
            <AppText variant="label" align="center">
              {formatLongDate(flight.departureUtc, from.utcOffsetMin, language)}
            </AppText>
            <View style={styles.barcode} accessible accessibilityLabel={t('pass.barcode')}>
              <Barcode seed={ticket.pass.raw} />
            </View>
            <AppText variant="caption" color={colors.textMuted} align="center">
              {t('pass.barcodeHint')}
            </AppText>
          </View>
        </Glass>
      </Animated.View>

      {params.justAdded && <Button label={t('pass.start')} icon={RouteIcon} onPress={start} style={styles.cta} />}
    </ScrollScreen>
  );
}

// O coloană din rândul principal; poarta și locul sunt cifre mari albastre
function Metric({ label, value, hero }: { label: string; value: string; hero?: boolean }) {
  return (
    <View style={styles.metric}>
      <AppText variant="label">{label}</AppText>
      <AppText variant={hero ? 'title' : 'headline'} color={hero ? colors.accentText : colors.text} numberOfLines={1} adjustsFontSizeToFit tabular>
        {value}
      </AppText>
    </View>
  );
}

function Info({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
  return (
    <View style={wide ? styles.infoWide : styles.info}>
      <AppText variant="label">{label}</AppText>
      <AppText variant="body" weight="700" numberOfLines={1}>
        {value}
      </AppText>
    </View>
  );
}

// Linia perforată, cu câte un decupaj rotund în fiecare parte (ca la un bilet care se rupe)
function Perforation() {
  return (
    <View style={styles.perfRow}>
      <View style={[styles.notch, styles.notchLeft]} />
      <View style={styles.perf} />
      <View style={[styles.notch, styles.notchRight]} />
    </View>
  );
}

// Cod de bare decorativ, derivat determinist din codul BCBP
function Barcode({ seed }: { seed: string }) {
  const bars: { x: number; w: number }[] = [];
  let x = 0;
  for (let i = 0; x < 300; i++) {
    const c = seed.charCodeAt(i % seed.length);
    const w = (c % 3) + 1;
    bars.push({ x, w });
    x += w + ((c >> 2) % 3) + 1;
  }
  return (
    <Svg width="100%" height="100%" viewBox="0 0 300 40" preserveAspectRatio="none">
      {bars.map((b, i) => (
        <Rect key={i} x={b.x} y={0} width={b.w} height={40} fill={colors.barcodeInk} />
      ))}
    </Svg>
  );
}

const NOTCH = 22;

const styles = StyleSheet.create({
  flex: { flex: 1 },
  toast: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  pass: { boxShadow: `0 16px 36px ${colors.shadowHero}` },
  top: { padding: spacing.lg, paddingBottom: spacing.md, gap: spacing.lg },
  airline: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  carrierMark: { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent },
  route: { flexDirection: 'row', alignItems: 'center' },
  end: { gap: 1 },
  endRight: { alignItems: 'flex-end' },
  mid: { flex: 1, alignItems: 'center', gap: 4, paddingHorizontal: spacing.sm },
  path: { flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch', gap: 6 },
  dash: { flex: 1, borderTopWidth: 1.5, borderStyle: 'dashed', borderColor: colors.text3 },
  planeDot: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent, boxShadow: `0 4px 12px ${colors.shadowGlow}` },
  metrics: {
    flexDirection: 'row',
    alignItems: 'stretch',
    paddingVertical: 14,
    paddingHorizontal: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.glassSubBorder,
    backgroundColor: colors.glassSub,
  },
  metric: { flex: 1, alignItems: 'center', gap: 2 },
  vline: { width: 1, alignSelf: 'stretch', backgroundColor: colors.lineVertical },
  secondary: { flexDirection: 'row', gap: spacing.md, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.line },
  infoWide: { flex: 2, gap: 2 },
  info: { flex: 1, gap: 2 },
  perfRow: { flexDirection: 'row', alignItems: 'center', height: NOTCH },
  perf: { flex: 1, borderTopWidth: 1.5, borderStyle: 'dashed', borderColor: colors.text3, marginHorizontal: spacing.xs },
  // Decupajele au culoarea cerului din spatele biletului, ca să pară găuri
  notch: { width: NOTCH, height: NOTCH, borderRadius: NOTCH / 2, backgroundColor: colors.horizonLav },
  notchLeft: { marginLeft: -NOTCH / 2 },
  notchRight: { marginRight: -NOTCH / 2 },
  barcodeWrap: { padding: spacing.lg, paddingTop: spacing.md, gap: spacing.sm },
  barcode: { height: 64, padding: spacing.sm, borderRadius: 12, backgroundColor: colors.white },
  cta: { marginTop: 'auto' },
});
