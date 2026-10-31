import { useNavigation } from '@react-navigation/native';
import {
  Check,
  DoorOpen,
  Droplet,
  IdCard,
  Laptop,
  Luggage,
  Map as MapIcon,
  Plane,
  RotateCcw,
  ShieldCheck,
  Ticket,
  Toilet,
  Building2,
  type LucideIcon,
} from 'lucide-react-native';
import { ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { AppText } from '../components/AppText';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { Glass } from '../components/Glass';
import { EmptyState, ProfileButton, Screen, ScrollScreen, ScreenHeader } from '../components/Layout';
import { TicketStrip } from '../components/TicketStrip';
import { MapPanel } from '../components/map/MapPanel';
import { SkyArt } from '../components/SkyArt';
import { StepItem } from '../components/StepItem';
import { useLanguage, useT, type TranslationKey } from '../i18n';
import { buildSteps, remainingWalkMin, stepStates, URGENT_GATE_MIN, type JourneyStep, type PrepKey, type StepState } from '../lib/journey';
import { formatDuration, formatLocalTime, formatLongDate, minutesBetween } from '../lib/time';
import { useNow } from '../lib/useNow';
import { flightData } from '../services';
import { useActiveTicket, useTickets } from '../store/tickets';
import { useLayout } from '../theme/responsive';
import { colors, radii, spacing } from '../theme/tokens';
import type { Airport, Flight } from '../types';
import { useFlightStatusVersion } from '../store/flightStatus';

const STEP_ICONS: Record<JourneyStep['id'], LucideIcon> = {
  arrive: Building2,
  checkin: Luggage,
  security: ShieldCheck,
  passport: IdCard,
  gate: DoorOpen,
  boarding: Plane,
};

const PREP_ICONS: Record<PrepKey, LucideIcon> = {
  liquids: Droplet,
  laptop: Laptop,
  document: IdCard,
  pass: Ticket,
  bag: Luggage,
  toilet: Toilet,
};

export function JourneyScreen({ onShowFlightDetails }: { onShowFlightDetails?: () => void } = {}) {
  const t = useT();
  const language = useLanguage();
  const navigation = useNavigation();
  const ticket = useActiveTicket();
  const completed = useTickets(s => (ticket ? s.completedSteps[ticket.id] ?? [] : []));
  const completeStep = useTickets(s => s.completeStep);
  const resetSteps = useTickets(s => s.resetSteps);
  const now = useNow();
  const { columns, sideNav } = useLayout();

  useFlightStatusVersion(); // re-render when the server changes the gate or a delay
  const flight = ticket ? flightData.getFlight(ticket.flightId) : null;
  const from = flight ? flightData.getAirport(flight.from) : null;
  const to = flight ? flightData.getAirport(flight.to) : null;

  if (!ticket || !flight || !from || !to) {
    return (
      <Screen>
        <ScreenHeader title={t('journey.title')} />
        <EmptyState icon={Ticket} title={t('journey.empty.title')} body={t('journey.empty.body')} actionLabel={t('journey.empty.cta')} onAction={() => navigation.navigate('AddTicket')} />
      </Screen>
    );
  }

  const steps = buildSteps(ticket, flight, from, to);
  const states = stepStates(steps, completed);
  const current = steps.find((_, i) => states[i] === 'current');
  // Biletul stă fixat sus în locul titlului; pe tableta landscape e în meniul lateral, deci păstrăm doar titlul
  const header = sideNav ? (
    <ScreenHeader title={t('journey.title')} subtitle={formatLongDate(flight.departureUtc, from.utcOffsetMin, language)} right={<ProfileButton />} />
  ) : null;
  const showOnMap = (nodeId: string) => navigation.navigate('Main', { screen: 'Map', params: { targetNodeId: nodeId } });

  const timeline = (
    <>
      <HeroCountdown flight={flight} from={from} seat={ticket.pass.seat} now={now} walkMin={remainingWalkMin(steps, states)} />
      <Glass style={styles.timeline}>
        {steps.map((step, i) => (
          <StepItem
            key={step.id}
            icon={STEP_ICONS[step.id]}
            title={t(`journey.step.${step.id}` as TranslationKey, { gate: flight.gate })}
            meta={stepMeta(step, t, flight, ticket.boardingGroup, ticket.pass.seat, from)}
            status={states[i]!}
            right={<StepRight state={states[i]!} step={step} flight={flight} from={from} />}
            last={i === steps.length - 1}
          >
            {states[i] === 'current' && (
              <View style={styles.prep}>
                <AppText variant="label">{t('journey.prepare')}</AppText>
                {step.prep.map(key => {
                  const Icon = PREP_ICONS[key];
                  return (
                    <View key={key} style={styles.prepRow}>
                      <Icon size={17} color={colors.accent} />
                      <AppText variant="body" style={styles.flex}>
                        {t(`journey.prep.${key}` as TranslationKey)}
                      </AppText>
                    </View>
                  );
                })}
                <View style={styles.prepActions}>
                  {/* Acțiunea principală a pasului e să-l bifezi; harta e un ajutor, deci rămâne secundară */}
                  <Button label={t('journey.done')} icon={Check} size="sm" onPress={() => completeStep(ticket.id, step.id)} />
                  {columns === 1 ? <Button label={t('journey.showOnMap')} icon={MapIcon} size="sm" variant="tinted" onPress={() => showOnMap(step.targetNodeId)} /> : null}
                </View>
              </View>
            )}
          </StepItem>
        ))}
      </Glass>
      {!current && (
        <Animated.View entering={FadeIn}>
          <Glass style={styles.allDone}>
            <AppText variant="headline" align="center">{t('journey.allDone')}</AppText>
            <View style={styles.completeActions}>
              <Button label={t('journey.openMap')} icon={MapIcon} variant="glass" size="sm" onPress={() => showOnMap(`f1_gate${flight.gate}`)} />
              <Button label={t('journey.flightDetails')} icon={Plane} size="sm" onPress={onShowFlightDetails} />
            </View>
            <Button label={t('journey.restart')} icon={RotateCcw} variant="glass" size="sm" onPress={() => resetSteps(ticket.id)} />
          </Glass>
        </Animated.View>
      )}
    </>
  );

  // Tabletă: pașii în stânga, harta (spre pasul curent) în dreapta
  if (columns === 2) {
    return (
      <Screen contentStyle={styles.tabletContent} top={<TicketStrip />}>
        {header}
        <View style={styles.columns}>
          <ScrollView style={styles.leftColumn} contentContainerStyle={styles.leftContent} showsVerticalScrollIndicator={false}>
            {timeline}
          </ScrollView>
          <View style={styles.mapColumn}>
            <MapPanel targetNodeId={current?.targetNodeId ?? `f1_gate${flight.gate}`} showDebug={false} />
          </View>
        </View>
      </Screen>
    );
  }

  return (
    <ScrollScreen top={<TicketStrip />}>
      {header}
      {timeline}
    </ScrollScreen>
  );
}

function stepMeta(step: JourneyStep, t: ReturnType<typeof useT>, flight: Flight, group: number, seat: string, from: Airport): string {
  switch (step.id) {
    case 'checkin':
      return t(step.skipped ? 'journey.step.checkin.metaSkip' : 'journey.step.checkin.meta');
    case 'gate':
      return t('journey.step.gate.meta', { floor: flight.gateFloor });
    case 'boarding':
      return `${formatLocalTime(flight.boardingUtc, from.utcOffsetMin)} · ${t('journey.step.boarding.meta', { group, seat })}`;
    default:
      return t(`journey.step.${step.id}.meta` as TranslationKey);
  }
}

function StepRight({ state, step, flight, from }: { state: StepState; step: JourneyStep; flight: Flight; from: Airport }) {
  const t = useT();
  if (state === 'skipped') return <Badge label={t('journey.skipped')} />;
  if (state === 'current') return <Badge label={t('journey.now', { min: step.etaMin })} tone="accent" />;
  if (step.id === 'boarding') {
    return (
      <AppText variant="caption" color={colors.text2} tabular>
        {formatLocalTime(flight.boardingUtc, from.utcOffsetMin)}
      </AppText>
    );
  }
  if (state === 'next') {
    return (
      <AppText variant="caption" color={colors.text2}>
        ~{step.etaMin} {t('common.min')}
      </AppText>
    );
  }
  return null;
}

/**
 * Cardul principal: minutele până la îmbarcare (aceeași cifră ca în Asistent), apoi locul, poarta și ora
 * îmbarcării pe o sub-placă de sticlă. După îmbarcare numără până la închiderea porții; sub 30 de minute
 * până la închidere cardul devine roșu.
 */
function HeroCountdown({ flight, from, seat, now, walkMin }: { flight: Flight; from: Airport; seat: string; now: Date; walkMin: number }) {
  const t = useT();
  const language = useLanguage();
  const { type } = useLayout();
  const toBoarding = minutesBetween(now, flight.boardingUtc);
  const toGateClose = minutesBetween(now, flight.gateCloseUtc);
  const closed = toGateClose <= 0;
  const urgent = !closed && toGateClose < URGENT_GATE_MIN;
  const minutes = Math.max(0, Math.round(toBoarding > 0 ? toBoarding : toGateClose));
  const label = closed ? t('journey.gateClosed') : toBoarding > 0 ? t('journey.untilBoarding') : t('journey.gateClosesIn');
  const tone = closed || urgent ? colors.danger : colors.text;
  const gateCloseAt = formatLocalTime(flight.gateCloseUtc, from.utcOffsetMin);
  return (
    <Glass
      tone="strong"
      radius={radii.hero}
      style={[styles.hero, (urgent || closed) && styles.heroUrgent]}
      accessible
      accessibilityLiveRegion={urgent ? 'polite' : 'none'}
      accessibilityLabel={closed ? label : `${label} ${formatDuration(minutes, language)}. ${t('journey.gate')} ${flight.gate}`}
    >
      {!urgent && !closed && <SkyArt />}
      <View style={styles.heroTop}>
        <AppText variant="label" color={urgent || closed ? colors.danger : colors.textMuted}>
          {label}
        </AppText>
        {!closed && <Badge label={t('journey.gateCloseAt', { time: gateCloseAt })} tone={urgent ? 'danger' : 'accent'} />}
      </View>
      {!closed && (
        <View style={styles.heroNumber}>
          {/* „1 h 58 min”: ore și minute, ca înainte */}
          <AppText variant="countdown" color={tone} tabular numberOfLines={1} adjustsFontSizeToFit style={{ fontSize: type.countdown.fontSize, lineHeight: type.countdown.fontSize * 1.15 }}>
            {formatDuration(minutes, language)}
          </AppText>
        </View>
      )}
      {urgent && (
        <AppText variant="caption" color={colors.text}>
          {t('journey.hurry', { walk: walkMin })}
        </AppText>
      )}
      <View style={styles.heroStrip}>
        <HeroMetric label={t('pass.seat')} value={seat} />
        <View style={styles.vline} />
        <HeroMetric label={t('journey.gate')} value={flight.gate} accent />
        <View style={styles.vline} />
        <HeroMetric label={t('pass.boarding')} value={formatLocalTime(flight.boardingUtc, from.utcOffsetMin)} />
      </View>
    </Glass>
  );
}

function HeroMetric({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <View style={styles.heroMetric}>
      <AppText variant="label">{label}</AppText>
      <AppText variant="headline" color={accent ? colors.accentText : colors.text} tabular numberOfLines={1}>
        {value}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  hero: { padding: spacing.lg, gap: spacing.sm, boxShadow: `0 16px 36px ${colors.shadowHero}` },
  heroUrgent: { backgroundColor: colors.dangerGlass, borderColor: colors.danger, borderWidth: 1.5 },
  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, flexWrap: 'wrap' },
  heroNumber: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  heroStrip: {
    flexDirection: 'row',
    marginTop: spacing.xs,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.glassSubBorder,
    backgroundColor: colors.glassSub,
  },
  heroMetric: { flex: 1, alignItems: 'center', gap: 2 },
  vline: { width: 1, alignSelf: 'stretch', backgroundColor: colors.lineVertical },
  timeline: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.xs },
  prep: { marginTop: spacing.sm, padding: spacing.md, borderRadius: 18, backgroundColor: colors.tilePlain, gap: 7 },
  prepRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  // Unul sub altul, pe toată lățimea: încap și textele lungi, iar acțiunea principală e prima
  prepActions: { gap: spacing.sm, marginTop: spacing.xs },
  allDone: { padding: spacing.lg, gap: spacing.md, alignItems: 'center' },
  completeActions: { width: '100%', gap: spacing.sm },
  tabletContent: { gap: spacing.md },
  columns: { flex: 1, flexDirection: 'row', gap: spacing.lg },
  leftColumn: { width: 380, flexGrow: 0 },
  // Spațiu jos ca butoanele pasului curent să nu stea lipite de marginea ecranului
  leftContent: { gap: spacing.md, paddingBottom: spacing.xxl },
  mapColumn: { flex: 1 },
});

