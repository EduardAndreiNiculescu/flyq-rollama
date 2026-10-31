import { useNavigation } from '@react-navigation/native';
import {
  CircleCheck,
  CloudDownload,
  IdCard,
  Info,
  Mountain,
  Plane,
  PlaneLanding,
  Route,
  Satellite,
  Signal,
  Ticket,
  TrainFront,
  ChevronRight,
  RotateCcw,
} from 'lucide-react-native';
import { memo, useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, FadeIn, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming, ZoomIn } from 'react-native-reanimated';
import { AppText } from '../components/AppText';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { IconTile, Toggle } from '../components/Controls';
import { FlightGlobeMap } from '../components/FlightGlobeMap';
import { Glass } from '../components/Glass';
import { GradientFill } from '../components/GradientFill';
import { PressableScale } from '../components/press';
import { EmptyState, ListRow, ProfileButton, RoundButton, Screen, ScrollScreen, ScreenHeader } from '../components/Layout';
import { FlyQLoader } from '../components/brand/FlyQLoader';
import { StatTile } from '../components/StatTile';
import { useLanguage, useT } from '../i18n';
import { haversineKm } from '../lib/geo';
import { formatDuration, formatLocalTime, formatNumber, minutesBetween } from '../lib/time';
import { flightData, flightTracker } from '../services';
import { useFlightMode } from '../store/flightMode';
import { useSettings } from '../store/settings';
import { useActiveTicket } from '../store/tickets';
import { useLayout } from '../theme/responsive';
import { colors, progressGradient, spacing } from '../theme/tokens';
import type { Airport, Flight, FlightPosition, Ticket as TicketT } from '../types';

export function FlightScreen({ onBackToJourney }: { onBackToJourney?: () => void } = {}) {
  const t = useT();
  const navigation = useNavigation();
  const ticket = useActiveTicket();
  // Selectori înguste: ecranul se re-randează doar când se schimbă faza, nu la fiecare poziție nouă
  const phase = useFlightMode(state => state.phase);
  const takeOff = useFlightMode(state => state.takeOff);
  const backToGround = useFlightMode(state => state.backToGround);

  const flight = ticket ? flightData.getFlight(ticket.flightId) : null;
  const from = flight ? flightData.getAirport(flight.from) : null;
  const to = flight ? flightData.getAirport(flight.to) : null;

  if (!ticket || !flight || !from || !to) {
    return (
      <Screen>
        <ScreenHeader title={t('flight.title')} />
        <EmptyState icon={Plane} title={t('journey.empty.title')} body={t('flight.noTicket')} actionLabel={t('journey.empty.cta')} onAction={() => navigation.navigate('AddTicket')} />
      </Screen>
    );
  }

  if (phase === 'landed') return <LandingView flight={flight} from={from} to={to} onReset={backToGround} />;

  const inAir = phase === 'inAir';
  const toggle = (value: boolean) => (value ? takeOff(flight) : backToGround());

  return (
    <ScrollScreen background={inAir ? 'sky' : 'default'} column="columnWide">
      <ScreenHeader
        title={t('flight.title')}
        subtitle={`${flight.carrier} ${flight.flightNumber} · ${from.code} → ${to.code}`}
        right={<View style={styles.headerActions}>{onBackToJourney ? <RoundButton icon={Route} label={t('flight.backToJourney')} onPress={onBackToJourney} /> : null}<ProfileButton /></View>}
      />
      {!inAir && <FlightTimes flight={flight} from={from} to={to} ticket={ticket} />}
      <Glass tone={inAir ? 'strong' : 'normal'} style={[styles.toggle, inAir && styles.toggleOn]}>
        <IconTile icon={Plane} tone={inAir ? 'accent' : 'soft'} />
        <View style={styles.flex}>
          <AppText variant="headline">{t('flight.inAir')}</AppText>
          {inAir ? <InAirStatus /> : (
            <AppText variant="caption" weight="400" color={colors.text2}>{t('flight.inAirHint')}</AppText>
          )}
        </View>
        <Toggle value={inAir} onChange={toggle} label={t('flight.inAir')} />
      </Glass>

      {inAir ? <Tracker flight={flight} from={from} to={to} /> : <PreFlight />}
      {/* Harta stă jos și ocupă cam jumătate din ecran. E aceeași înainte și în timpul zborului
          (nu se reîncarcă la comutare): se mută doar avionul. */}
      <GlobeSection flight={flight} from={from} to={to} inAir={inAir} />
      {inAir && flightTracker.debug ? <DebugSourceLink /> : null}
    </ScrollScreen>
  );
}

// Sub comutator: sursa poziției (GPS sau estimare); până vine prima poziție, nota de pe sol
function InAirStatus() {
  const t = useT();
  const position = useFlightMode(state => state.position);
  if (!position) return <AppText variant="caption" weight="400" color={colors.text2}>{t('flight.inAirHint')}</AppText>;
  return <SourceBadge position={position} />;
}

// Harta stă într-o componentă proprie, ca poziția nouă să nu re-randeze tot ecranul
const GlobeSection = memo(function GlobeSectionView({ flight, from, to, inAir }: { flight: Flight; from: Airport; to: Airport; inAir: boolean }) {
  const t = useT();
  const position = useFlightMode(state => state.position);
  return (
    <FlightGlobeMap
      from={from}
      to={to}
      landmarks={flightData.getLandmarks()}
      position={inAir ? position : null}
      accessibilityLabel={t('flight.mapLabel')}
      estimateLabel={t('flight.estimatedZone')}
      departureLabel={`${t('flight.departure')} ${formatLocalTime(flight.departureUtc, from.utcOffsetMin)}`}
      arrivalLabel={`${t('flight.arrival')} ${formatLocalTime(flight.arrivalUtc, to.utcOffsetMin)}`}
    />
  );
});

function DebugSourceLink() {
  const t = useT();
  const source = useFlightMode(state => state.position?.source);
  if (!source) return null;
  return (
    <PressableScale onPress={() => flightTracker.debug?.setSource(source === 'estimate' ? 'gps' : 'estimate')} accessibilityRole="button" style={styles.debugLink}>
      <AppText variant="caption" color={colors.textMuted}>{t('flight.debugGps')}</AppText>
    </PressableScale>
  );
}

function SourceBadge({ position }: { position: FlightPosition }) {
  const t = useT();
  return position.source === 'gps' ? (
    <Badge tone="success" icon={Satellite} label={t('flight.source.gps', { acc: Math.round(position.accuracyM) })} />
  ) : (
    <Badge tone="warning" icon={Satellite} label={t('flight.source.estimate')} />
  );
}

function PreFlight() {
  const t = useT();
  return (
    <>
      <Glass style={styles.fact}>
        <IconTile icon={CloudDownload} />
        <View style={styles.flex}>
          <AppText variant="headline">{t('flight.downloaded')}</AppText>
          <AppText variant="caption" weight="400" color={colors.text2}>{t('flight.downloadedBody')}</AppText>
        </View>
      </Glass>
    </>
  );
}

// Cardul cu decolarea și aterizarea, primul pe ecran înainte de zbor
function FlightTimes({ flight, from, to, ticket }: { flight: Flight; from: Airport; to: Airport; ticket: TicketT }) {
  const t = useT();
  const language = useLanguage();
  const distance = haversineKm(from, to);
  return (
      <Glass style={styles.card}>
        <View style={styles.times}>
          <View>
            <AppText variant="label">{t('flight.departure')}</AppText>
            <AppText variant="countdown" tabular>{formatLocalTime(flight.departureUtc, from.utcOffsetMin)}</AppText>
            <AppText variant="caption" color={colors.text2}>{from.city}</AppText>
          </View>
          <View style={styles.mid}>
            <Plane size={24} color={colors.accent} />
            <AppText variant="caption" color={colors.text2}>{formatDuration(minutesBetween(flight.departureUtc, flight.arrivalUtc), language)}</AppText>
          </View>
          <View style={styles.right}>
            <AppText variant="label">{t('flight.arrival')}</AppText>
            <AppText variant="countdown" tabular>{formatLocalTime(flight.arrivalUtc, to.utcOffsetMin)}</AppText>
            <AppText variant="caption" color={colors.text2} align="right">{to.city}</AppText>
          </View>
        </View>
        <View style={styles.divider} />
        <View style={styles.facts}>
          <Fact label={t('flight.distance')} value={`${formatNumber(distance)} km`} />
          <Fact label={t('flight.aircraft')} value={flight.aircraft.replace('Airbus ', '')} />
          <Fact label={t('flight.seat')} value={ticket.pass.seat} />
        </View>
      </Glass>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.flex}>
      <AppText variant="label">{label}</AppText>
      <AppText variant="headline" tabular>{value}</AppText>
    </View>
  );
}

function Tracker({ flight, from, to }: { flight: Flight; from: Airport; to: Airport }) {
  const t = useT();
  const position = useFlightMode(state => state.position);
  const language = useLanguage();
  const { columns } = useLayout();
  const localized = (v: { ro: string; en: string }) => v[language];
  const landmarks = flightData.getLandmarks();
  const nearest = landmarks.find(l => l.id === position?.nearestLandmarkId);
  const total = haversineKm(from, to);

  if (!position) {
    // Până vine prima poziție de la tracker, loader-ul FlyQ arată că poziția se actualizează
    return (
      <Glass style={styles.loaderBox}>
        <FlyQLoader variant="inline" message={t('loader.flight')} />
      </Glass>
    );
  }
  const est = position.source === 'estimate';
  const tilde = est ? '~' : '';
  const eta = formatLocalTime(flight.arrivalUtc, to.utcOffsetMin);

  return (
    <>
      {est && (
        <Animated.View entering={FadeIn}>
          <Glass style={styles.window}>
            <IconTile icon={Satellite} tone="warning" />
            <View style={styles.flex}>
              <AppText variant="headline">{t('flight.window')}</AppText>
              <AppText variant="caption" weight="400" color={colors.text2}>{t('flight.windowSub')}</AppText>
            </View>
          </Glass>
        </Animated.View>
      )}
      <View style={[styles.metrics, columns === 2 && styles.metricsWide]}>
        <View style={styles.metricRow}>
          <StatTile label={t('flight.altitude')} value={`${tilde}${formatNumber(est ? Math.round(position.altitudeM / 500) * 500 : position.altitudeM)}`} unit="m" hint={est ? t('flight.estimated') : flightLevel(position.altitudeM)} estimated={est} />
          <StatTile label={t('flight.speed')} value={`${tilde}${formatNumber(est ? Math.round(position.groundSpeedKmh / 10) * 10 : position.groundSpeedKmh)}`} unit="km/h" hint={est ? t('flight.estimated') : undefined} estimated={est} />
        </View>
        <View style={styles.metricRow}>
          <StatTile label={t('flight.timeLeft')} value={`${tilde}${formatDuration(position.timeRemainingMin, language)}`} hint={t('flight.eta', { time: eta })} />
          <StatTile label={t('flight.distanceLeft')} value={`${tilde}${formatNumber(position.distanceRemainingKm)}`} unit="km" hint={est ? t('flight.estimated') : t('flight.of', { total: formatNumber(total) })} estimated={est} />
        </View>
      </View>
      <FlightProgress
        progress={position.progress}
        estimated={est}
        from={from.code}
        to={to.code}
        departure={formatLocalTime(flight.departureUtc, from.utcOffsetMin)}
        arrival={eta}
      />
      {est ? (
        <Glass style={styles.fact}>
          <IconTile icon={Info} />
          <View style={styles.flex}>
            <AppText variant="headline">{t('flight.approx')}</AppText>
            <AppText variant="caption" weight="400" color={colors.text2}>{t('flight.approxBody')}</AppText>
          </View>
        </Glass>
      ) : nearest ? (
        <Animated.View key={nearest.id} entering={FadeIn.duration(400)}>
          <Glass style={styles.fact}>
            <IconTile icon={Mountain} />
            <View style={styles.flex}>
              <AppText variant="headline">{t('flight.over', { place: nearest.name })}</AppText>
              <AppText variant="caption" weight="400" color={colors.text2}>{localized(nearest.fact)}</AppText>
            </View>
          </Glass>
        </Animated.View>
      ) : null}
    </>
  );
}

// Progresul zborului: codurile aeroporturilor, bara cu gradient și avionul în capătul ei, orele dedesubt
const FlightProgress = memo(function FlightProgressView({ progress, estimated, from, to, departure, arrival }: { progress: number; estimated: boolean; from: string; to: string; departure: string; arrival: string }) {
  const t = useT();
  const reduceMotion = useReducedMotion();
  const pct = Math.min(1, Math.max(0, progress)) * 100;
  // Poziția vine o dată pe secundă și se mută cu câțiva px: o alunecare scurtă (nu continuă, ca să nu ținem ecranul la 60 fps)
  const shown = useSharedValue(pct);
  useEffect(() => {
    shown.value = withTiming(pct, { duration: reduceMotion ? 0 : 250, easing: Easing.out(Easing.quad) });
  }, [pct, reduceMotion, shown]);
  // Doar transformări (fără width/left): animația rulează pe compozitor, fără un layout nou la fiecare cadru
  const fillStyle = useAnimatedStyle(() => ({ transform: [{ translateX: `${shown.value - 100}%` }] }));
  const planeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: `${shown.value}%` }] }));
  return (
    <Glass tone="strong" style={styles.progressCard} accessible accessibilityLabel={`${t('flight.progress')}: ${from} → ${to}, ${Math.round(pct)}%`}>
      <AppText variant="label">{t('flight.progress')}</AppText>
      <View style={styles.progressEnds}>
        <AppText variant="title">{from}</AppText>
        <AppText variant="headline" color={colors.accentText} tabular>{Math.round(pct)}%</AppText>
        <AppText variant="title">{to}</AppText>
      </View>
      <View style={styles.track}>
        <View style={styles.fillClip}>
          <Animated.View style={[styles.fill, fillStyle, estimated && styles.fillDim]}>
            <GradientFill colors={progressGradient} />
          </Animated.View>
        </View>
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, planeStyle]}>
          <View style={styles.planeOnTrack}>
            <Plane size={14} color={colors.onAccent} strokeWidth={2.4} />
          </View>
        </Animated.View>
      </View>
      <View style={styles.progressEnds}>
        <AppText variant="caption" color={colors.textMuted} tabular>{departure}</AppText>
        <AppText variant="caption" color={colors.textMuted} tabular>{arrival}</AppText>
      </View>
    </Glass>
  );
});

/** Nivelul de zbor, în sute de picioare, rotunjit la 10: 11 280 m → FL370 */
function flightLevel(altitudeM: number): string {
  return `FL${String(Math.round((altitudeM * 3.28084) / 1000) * 10).padStart(3, '0')}`;
}

function LandingView({ flight, from, to, onReset }: { flight: Flight; from: Airport; to: Airport; onReset: () => void }) {
  const t = useT();
  const navigation = useNavigation();
  const { landingLocalTime, landingAirplaneReminder } = useSettings();
  const localTime = formatLocalTime(flight.arrivalUtc, to.utcOffsetMin);
  const homeTime = formatLocalTime(flight.arrivalUtc, from.utcOffsetMin);
  const diffH = (to.utcOffsetMin - from.utcOffsetMin) / 60;
  return (
    <ScrollScreen column="columnNarrow">
      <Animated.View entering={ZoomIn.duration(400)} style={styles.hero}>
        <View style={styles.ring}>
          <PlaneLanding size={36} color={colors.onAccent} />
        </View>
        <AppText variant="title" align="center">{t('landing.title', { city: to.city })}</AppText>
        <AppText variant="body" color={colors.text2} align="center">{t('landing.subtitle', { time: localTime })}</AppText>
      </Animated.View>
      {landingLocalTime && (
        <Glass style={styles.tz}>
          <View style={styles.tzCol}>
            <AppText variant="label">{t('landing.local', { city: to.city })}</AppText>
            <AppText variant="countdown" tabular>{localTime}</AppText>
          </View>
          <Badge tone="accent" label={`${diffH > 0 ? '+' : '−'}${Math.abs(diffH)} h`} />
          <View style={styles.tzCol}>
            <AppText variant="label">{t('landing.home')}</AppText>
            <AppText variant="countdown" tabular color={colors.text2}>{homeTime}</AppText>
          </View>
        </Glass>
      )}
      <Glass style={styles.list}>
        {!to.schengen && <ListRow icon={IdCard} title={t('landing.arrivalControl')} subtitle={t('landing.arrivalControlBody')} right={<ChevronRight size={20} color={colors.text3} />} />}
        {landingAirplaneReminder && <ListRow icon={Signal} title={t('landing.airplaneMode')} subtitle={t('landing.airplaneModeBody')} right={<Badge tone="success" icon={CircleCheck} label={t('landing.done')} />} />}
        <ListRow icon={TrainFront} title={t('landing.toCity')} subtitle={t('landing.toCityBody')} right={<ChevronRight size={20} color={colors.text3} />} last />
      </Glass>
      <View style={styles.actions}>
        <Button label={t('landing.newTrip')} icon={Ticket} variant="glass" onPress={() => navigation.navigate('AddTicket')} />
        <Button label={t('journey.restart')} icon={RotateCcw} variant="glass" onPress={onReset} />
      </View>
    </ScrollScreen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, gap: 2 },
  headerActions: { flexDirection: 'row', gap: spacing.sm },
  loaderBox: { minHeight: 180, alignItems: 'center', justifyContent: 'center' },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md },
  toggleOn: { borderColor: colors.accent, borderWidth: 1.5 },
  card: { padding: spacing.lg },
  times: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  mid: { alignItems: 'center', paddingBottom: spacing.lg, gap: 2 },
  right: { alignItems: 'flex-end' },
  divider: { height: 1, backgroundColor: colors.line, marginVertical: spacing.md },
  facts: { flexDirection: 'row', gap: spacing.sm },
  fact: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, padding: spacing.lg },
  window: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg, backgroundColor: colors.warningGlass, borderColor: colors.warning, borderWidth: 1.5 },
  metrics: { gap: spacing.md },
  metricsWide: { flexDirection: 'row' },
  metricRow: { flexDirection: 'row', gap: spacing.md, flex: 1 },
  progressCard: { padding: spacing.lg, gap: spacing.sm },
  progressEnds: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  track: { height: 8, borderRadius: 4, backgroundColor: colors.progressTrack, justifyContent: 'center', marginVertical: spacing.sm },
  fillClip: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, borderRadius: 4, overflow: 'hidden' },
  fill: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, borderRadius: 4, overflow: 'hidden' },
  fillDim: { opacity: 0.55 },
  planeOnTrack: {
    position: 'absolute',
    left: 0,
    top: -10,
    width: 28,
    height: 28,
    marginLeft: -14,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
    borderWidth: 2,
    borderColor: colors.white,
    boxShadow: `0 4px 10px ${colors.shadowGlow}`,
  },
  debugLink: { alignSelf: 'center', padding: spacing.sm, minHeight: 44, justifyContent: 'center' },
  hero: { alignItems: 'center', gap: spacing.sm, paddingTop: spacing.lg },
  ring: { width: 80, height: 80, borderRadius: 40, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', borderWidth: 10, borderColor: colors.accentSoft, marginBottom: spacing.sm },
  tz: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', padding: spacing.lg },
  tzCol: { alignItems: 'center' },
  list: { paddingHorizontal: spacing.lg, paddingVertical: 4 },
  actions: { gap: spacing.sm },
});
