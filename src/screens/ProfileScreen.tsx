import { useNavigation, CommonActions } from '@react-navigation/native';
import { ArrowUpDown, Bell, ChevronRight, Clock, FlaskConical, Layers, Phone, Play, Plus, RotateCcw, ShieldAlert, Ticket, Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import { Alert, Linking, StyleSheet, View } from 'react-native';
import { AppText } from '../components/AppText';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { Segmented, Toggle } from '../components/Controls';
import { Glass } from '../components/Glass';
import { GradientFill } from '../components/GradientFill';
import { ListRow, ScrollScreen, ScreenHeader } from '../components/Layout';
import { useLanguage, useT } from '../i18n';
import { formatLocalTime, formatLongDate } from '../lib/time';
import { clock, flightData } from '../services';
import { useFlightMode } from '../store/flightMode';
import { useIndoorNav } from '../store/indoorNav';
import { useSettings } from '../store/settings';
import { useSplash } from '../store/splash';
import { appStorage } from '../store/storage';
import { useTickets } from '../store/tickets';
import { useLayout } from '../theme/responsive';
import { colors, radii, spacing, chatGradient } from '../theme/tokens';
import { syncReminders } from '../services/live/localReminders';

export function ProfileScreen() {
  const t = useT();
  const language = useLanguage();
  const navigation = useNavigation();
  const settings = useSettings();
  const { tickets, activeTicketId, setActive, clearAll } = useTickets();
  const { columns } = useLayout();
  const [, refresh] = useState(0);
  const replaySplash = useSplash(s => s.replay);

  const clearData = () =>
    Alert.alert(t('profile.clearConfirmTitle'), t('profile.clearConfirmBody'), [
      { text: t('profile.cancel'), style: 'cancel' },
      {
        text: t('profile.clearConfirm'),
        style: 'destructive',
        onPress: async () => {
          useIndoorNav.getState().stop();
          useFlightMode.getState().backToGround();
          clearAll();
          settings.reset();
          await appStorage.clear();
          navigation.dispatch(CommonActions.reset({ index: 0, routes: [{ name: 'AddTicket' }] }));
        },
      },
    ]);

  const demoNow = clock.now();
  const dial = (number: string) => void Linking.openURL(`tel:${number}`).catch(() => Alert.alert(t('profile.emergency'), number));
  const sections = (
    <>
      <View style={styles.section}>
        <AppText variant="label">{t('profile.emergency')}</AppText>
        <Glass style={styles.list}>
          <ListRow icon={ShieldAlert} iconTone="accent" title={t('profile.emergency.eu')} subtitle="112" onPress={() => dial('112')} />
          <ListRow icon={Phone} title={t('profile.emergency.airportSecurity')} subtitle="0754 022 508" onPress={() => dial('0754022508')} />
          <ListRow icon={Phone} title={t('profile.emergency.airportOffice')} subtitle="0251 416 860" onPress={() => dial('0251416860')} />
          <ListRow icon={Phone} title={t('profile.emergency.consular')} subtitle="+44 7738 716 335" onPress={() => dial('+447738716335')} last />
        </Glass>
        <AppText variant="caption" weight="400" color={colors.textMuted}>{t('profile.emergency.note')}</AppText>
      </View>
      <View style={styles.section}>
        <AppText variant="label">{t('profile.tickets')}</AppText>
        <Glass style={styles.list}>
          {tickets.map((ticket, i) => {
            const flight = flightData.getFlight(ticket.flightId);
            const from = flight ? flightData.getAirport(flight.from) : null;
            const active = ticket.id === activeTicketId;
            return (
              <ListRow
                key={ticket.id}
                icon={Ticket}
                iconTone={active ? 'accent' : 'default'}
                title={`${ticket.pass.from} → ${ticket.pass.to} · ${ticket.pass.carrier} ${ticket.pass.flightNumber}`}
                subtitle={flight && from ? `${formatLongDate(flight.departureUtc, from.utcOffsetMin, language)} · ${formatLocalTime(flight.departureUtc, from.utcOffsetMin)} · ${ticket.pass.seat}` : ticket.pass.seat}
                right={active ? <Badge tone="accent" label={t('profile.active')} /> : <ChevronRight size={20} color={colors.text3} />}
                onPress={() => (active ? navigation.navigate('Pass', { ticketId: ticket.id }) : setActive(ticket.id))}
                last={i === tickets.length - 1}
              />
            );
          })}
          <ListRow icon={Plus} title={t('profile.addTicket')} onPress={() => navigation.navigate('AddTicket')} />
          <ListRow icon={FlaskConical} title="Mod test" subtitle="Zbor real, asistent real, notificări" onPress={() => navigation.navigate('Live')} last />
        </Glass>
      </View>
    </>
  );

  const preferences = (
    <>
      <View style={styles.section}>
        <AppText variant="label">{t('profile.landing')}</AppText>
        <Glass style={styles.list}>
          <ListRow icon={Clock} title={t('profile.localTime')} subtitle={t('profile.localTimeHint')} right={<Toggle value={settings.landingLocalTime} onChange={settings.setLandingLocalTime} label={t('profile.localTime')} />} />
          <ListRow icon={Bell} title={t('profile.flightReminders')} subtitle={t('profile.flightRemindersHint')} right={<Toggle value={settings.flightReminders} onChange={v => { settings.setFlightReminders(v); void syncReminders(); }} label={t('profile.flightReminders')} />} />
          <ListRow icon={Bell} title={t('profile.airplaneReminder')} subtitle={t('profile.airplaneReminderHint')} right={<Toggle value={settings.landingAirplaneReminder} onChange={settings.setLandingAirplaneReminder} label={t('profile.airplaneReminder')} />} last />
        </Glass>
      </View>

      <View style={styles.section}>
        <AppText variant="label">{t('profile.accessibility')}</AppText>
        <Glass style={styles.list}>
          <ListRow icon={Layers} title={t('profile.reduceTransparency')} subtitle={t('profile.reduceTransparencyHint')} right={<Toggle value={settings.reduceTransparency} onChange={settings.setReduceTransparency} label={t('profile.reduceTransparency')} />} />
          <ListRow icon={ArrowUpDown} title={t('profile.avoidStairs')} subtitle={t('profile.avoidStairsHint')} right={<Toggle value={settings.avoidStairs} onChange={settings.setAvoidStairs} label={t('profile.avoidStairs')} />} last />
        </Glass>
      </View>

      <View style={styles.section}>
        <AppText variant="label">{t('profile.demo')}</AppText>
        <Glass style={styles.demo}>
          {/* Ceasul simulat, mare, ca pe un ecran de plecări */}
          <View>
            <AppText variant="label">{t('profile.demoClockLabel')}</AppText>
            <AppText variant="countdown" tabular>
              {formatLocalTime(demoNow, 120)}
            </AppText>
          </View>
          <View style={styles.demoActions}>
            <Button label={t('profile.demoAdvance')} variant="glass" size="sm" onPress={() => { clock.advance(30); refresh(n => n + 1); }} style={styles.flex} />
            <Button label={t('profile.demoReset')} icon={RotateCcw} variant="glass" size="sm" onPress={() => { clock.reset(); refresh(n => n + 1); }} style={styles.flex} />
          </View>
          <Button label={t('profile.demoSplash')} icon={Play} variant="glass" size="sm" onPress={replaySplash} />
        </Glass>
      </View>

      {/* The 3D terminal map from the flyq-spatial module (iPhone, needs the build with the module) */}
      <Button label={language === 'ro' ? 'Harta 3D a terminalului (beta)' : '3D terminal map (beta)'} icon={Layers} variant="glass" onPress={() => navigation.navigate('FlyQMap')} />
      <Button label={t('profile.clear')} icon={Trash2} variant="danger" onPress={clearData} />
      <AppText variant="caption" weight="400" color={colors.textMuted} align="center">
        {t('profile.version')}
      </AppText>
    </>
  );

  // Cardul de profil: avatar cu gradient, numele pasagerului, zborul activ și limba aplicației
  const activeTicket = tickets.find(x => x.id === activeTicketId);
  const header = (
    <>
      <ScreenHeader title={t('profile.title')} subtitle={t('profile.subtitle')} onBack={() => navigation.goBack()} />
      <Glass tone="strong" radius={radii.hero} style={styles.hero}>
        <View style={styles.heroRow}>
          <View style={styles.avatar}>
            <GradientFill colors={chatGradient} />
            <AppText variant="title" color={colors.onGradient}>
              {initials(activeTicket?.pass.passengerName)}
            </AppText>
          </View>
          <View style={styles.flex}>
            <AppText variant="headline" numberOfLines={1}>
              {displayName(activeTicket?.pass.passengerName) ?? t('profile.title')}
            </AppText>
            {activeTicket ? (
              <AppText variant="caption" color={colors.textMuted} numberOfLines={1}>
                {activeTicket.pass.from} → {activeTicket.pass.to} · {activeTicket.pass.carrier} {activeTicket.pass.flightNumber}
              </AppText>
            ) : null}
          </View>
        </View>
        <View style={styles.heroLang}>
          <AppText variant="label">{t('profile.language')}</AppText>
          <Segmented
            value={language}
            onChange={settings.setLanguage}
            options={[
              { value: 'ro', label: 'Română' },
              { value: 'en', label: 'English' },
            ]}
          />
        </View>
      </Glass>
    </>
  );

  if (columns === 2) {
    return (
      <ScrollScreen bottomInset="safeArea">
        {header}
        <View style={styles.columns}>
          <View style={[styles.flex, styles.col]}>{sections}</View>
          <View style={[styles.flex, styles.col]}>{preferences}</View>
        </View>
      </ScrollScreen>
    );
  }

  return (
    <ScrollScreen bottomInset="safeArea">
      {header}
      {sections}
      {preferences}
    </ScrollScreen>
  );
}

/** „POPESCU/ANDREI” → „Andrei Popescu” */
function displayName(name?: string): string | null {
  if (!name) return null;
  const cap = (w: string) => w.charAt(0) + w.slice(1).toLowerCase();
  const [last, first] = name.split('/');
  return [first, last].filter(Boolean).map(w => cap(w!.trim())).join(' ');
}

/** „POPESCU/ANDREI” → „AP” */
function initials(name?: string): string {
  if (!name) return '·';
  const [last, first] = name.split('/');
  return `${first?.[0] ?? ''}${last?.[0] ?? ''}`.toUpperCase() || '·';
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  hero: { padding: spacing.lg, gap: spacing.lg, boxShadow: `0 16px 36px ${colors.shadowHero}` },
  heroRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  heroLang: { gap: spacing.sm },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.glassEdgeLit,
    boxShadow: `0 6px 16px ${colors.shadowGlow}`,
  },
  section: { gap: spacing.sm },
  list: { paddingHorizontal: spacing.lg, paddingVertical: 2 },
  demo: { padding: spacing.lg, gap: spacing.md },
  demoActions: { flexDirection: 'row', gap: spacing.sm },
  columns: { flexDirection: 'row', gap: spacing.lg, alignItems: 'flex-start' },
  col: { gap: spacing.md },
});
