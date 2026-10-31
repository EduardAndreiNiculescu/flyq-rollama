import { useNavigation } from '@react-navigation/native';
import { CircleOff, DoorOpen, MapPin, Plane, Sparkles, Ticket, X } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { AppText } from '../components/AppText';
import { Badge, type BadgeTone } from '../components/Badge';
import { Button } from '../components/Button';
import { Glass } from '../components/Glass';
import { EmptyState, RoundButton, Screen, ScrollScreen, ScreenHeader } from '../components/Layout';
import { useLanguage } from '../i18n';
import { formatLocalTime } from '../lib/time';
import { clock, flightData } from '../services';
import { recordFor } from '../services/live/DeviceAssistantService';
import { endFlightActivity, refreshFlightActivity } from '../services/live/liveActivity';
import type { ArrivalEstimate } from '../services/live/arrival';
import { useActiveTicket } from '../store/tickets';
import { colors, radii, spacing } from '../theme/tokens';

const pad = (n: number) => String(n).padStart(2, '0');
function countdown(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  return h > 0 ? `${h}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}` : `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
}

/**
 * The screen a tap on the Live Activity opens (flyq://live): the flight at a glance, with a countdown that runs by itself, the landing estimate
 * from the live position when the aircraft is in the air, and shortcuts to the map, the assistant and the flight details.
 */
export function LiveFlightScreen() {
  const ro = useLanguage() === 'ro';
  const navigation = useNavigation();
  const ticket = useActiveTicket();
  const flight = ticket ? flightData.getFlight(ticket.flightId) : null;
  const from = flight ? flightData.getAirport(flight.from) : null;
  const to = flight ? flightData.getAirport(flight.to) : null;
  const [now, setNow] = useState(() => clock.now().getTime());
  const [arrival, setArrival] = useState<ArrivalEstimate | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const record = useMemo(() => (flight ? recordFor(flight) : null), [flight]);

  useEffect(() => {
    const t = setInterval(() => setNow(clock.now().getTime()), 1000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (!record) return;
    let alive = true;
    const run = () => void refreshFlightActivity(record).then(a => alive && setArrival(a));
    run();
    const t = setInterval(run, 30_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [record]);

  const toMain = (screen: 'Map' | 'Assistant' | 'Flight') => navigation.navigate('Main', { screen });

  if (!ticket || !flight || !from || !to) {
    return (
      <Screen bottomInset="safeArea">
        <EmptyState icon={Plane} title={ro ? 'Niciun zbor activ' : 'No active flight'} body={ro ? 'Adaugă un bilet ca să vezi zborul live.' : 'Add a ticket to see your flight live.'} actionLabel={ro ? 'Înapoi' : 'Back'} onAction={() => navigation.navigate('Main')} />
      </Screen>
    );
  }

  const boardingMs = Date.parse(flight.boardingUtc);
  const departureMs = Date.parse(flight.departureUtc);
  const inAir = !!arrival;
  let label: string;
  let seconds: number;
  let tone: BadgeTone;
  let status: string;
  if (inAir) {
    label = ro ? 'Aterizare în' : 'Landing in';
    seconds = arrival.arrivalEpoch - now / 1000;
    tone = 'success';
    status = ro ? 'În zbor' : 'In the air';
  } else if (now < boardingMs) {
    label = ro ? 'Îmbarcare în' : 'Boarding in';
    seconds = (boardingMs - now) / 1000;
    tone = 'accent';
    status = ro ? 'La timp' : 'On time';
  } else if (now < departureMs) {
    label = ro ? 'Decolare în' : 'Departure in';
    seconds = (departureMs - now) / 1000;
    tone = 'warning';
    status = ro ? 'Îmbarcare' : 'Boarding';
  } else {
    label = ro ? 'Decolare programată' : 'Scheduled departure';
    seconds = 0;
    tone = 'neutral';
    status = ro ? 'Programat' : 'Scheduled';
  }
  const progress = inAir ? arrival.progress : now < boardingMs ? 0.08 : now < departureMs ? 0.4 : 0.1;
  const arrivalTime = inAir ? arrival.arrivalTime : formatLocalTime(flight.arrivalUtc, to.utcOffsetMin);

  const stop = async () => {
    const r = await endFlightActivity();
    setNote(r.message);
  };

  return (
    <ScrollScreen bottomInset="safeArea" column="columnNarrow">
      <ScreenHeader title={ro ? 'Zbor live' : 'Live flight'} subtitle={`${flight.carrier} ${flight.flightNumber}`} right={<RoundButton icon={X} label={ro ? 'Închide' : 'Close'} onPress={() => navigation.navigate('Main')} />} />

      <Animated.View entering={FadeInDown.duration(380)}>
        <Glass tone="strong" radius={radii.hero} style={styles.hero}>
          <View style={styles.row}>
            <View>
              <AppText variant="display">{from.code}</AppText>
              <AppText variant="caption" color={colors.textMuted}>{from.city}</AppText>
            </View>
            <Plane size={26} color={colors.accent} strokeWidth={2.2} />
            <View style={styles.right}>
              <AppText variant="display">{to.code}</AppText>
              <AppText variant="caption" color={colors.textMuted}>{to.city}</AppText>
            </View>
          </View>

          <View style={styles.track} accessibilityRole="progressbar">
            <View style={[styles.fill, { width: `${Math.round(progress * 100)}%` }]} />
          </View>

          <View style={styles.center}>
            <Badge label={status} tone={tone} />
            <AppText variant="label" color={colors.textMuted}>{label}</AppText>
            <AppText variant="display" tabular style={styles.clock}>{seconds > 0 ? countdown(seconds) : '--:--'}</AppText>
            {inAir ? <AppText variant="caption" color={colors.textMuted}>{ro ? `Estimare din poziția live · ${arrival.remainingKm} km rămași` : `Estimate from the live position · ${arrival.remainingKm} km left`}</AppText> : null}
          </View>

          <View style={styles.metrics}>
            <Metric label={ro ? 'Poartă' : 'Gate'} value={flight.gate} hero />
            <Metric label={ro ? 'Îmbarcare' : 'Boarding'} value={formatLocalTime(flight.boardingUtc, from.utcOffsetMin)} />
            <Metric label={ro ? 'Decolare' : 'Departure'} value={formatLocalTime(flight.departureUtc, from.utcOffsetMin)} />
            <Metric label={inAir ? (ro ? 'Aterizare (est.)' : 'Landing (est.)') : ro ? 'Aterizare' : 'Landing'} value={arrivalTime} />
          </View>
        </Glass>
      </Animated.View>

      <View style={styles.actions}>
        <Button label={ro ? 'Arată poarta pe hartă' : 'Show the gate on the map'} icon={MapPin} onPress={() => toMain('Map')} />
        <Button label={ro ? 'Întreabă asistentul' : 'Ask the assistant'} icon={Sparkles} variant="glass" onPress={() => toMain('Assistant')} />
        <Button label={ro ? 'Detalii zbor' : 'Flight details'} icon={Ticket} variant="glass" onPress={() => toMain('Flight')} />
        <Button label={ro ? 'Oprește cardul' : 'Stop the card'} icon={CircleOff} variant="glass" size="sm" onPress={stop} />
        {note ? <AppText variant="caption" color={colors.textMuted} align="center">{note}</AppText> : null}
      </View>
    </ScrollScreen>
  );
}

function Metric({ label, value, hero }: { label: string; value: string; hero?: boolean }) {
  return (
    <View style={styles.metric}>
      <AppText variant="label">{label}</AppText>
      <AppText variant={hero ? 'title' : 'headline'} color={hero ? colors.accentText : colors.text} numberOfLines={1} adjustsFontSizeToFit tabular>{value}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { padding: spacing.lg, gap: spacing.lg, boxShadow: `0 16px 36px ${colors.shadowHero}` },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  right: { alignItems: 'flex-end' },
  track: { height: 8, borderRadius: 4, backgroundColor: colors.glassSub, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4, backgroundColor: colors.accent },
  center: { alignItems: 'center', gap: spacing.xs },
  clock: { fontSize: 56 },
  metrics: { flexDirection: 'row', alignItems: 'stretch', paddingVertical: 14, paddingHorizontal: spacing.sm, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.glassSubBorder, backgroundColor: colors.glassSub },
  metric: { flex: 1, alignItems: 'center', gap: 2 },
  actions: { gap: spacing.sm, marginTop: spacing.md },
});
