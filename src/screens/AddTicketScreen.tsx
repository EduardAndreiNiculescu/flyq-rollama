import { useNavigation } from '@react-navigation/native';
import { ChevronRight, ClipboardPaste, Globe, Hash, Lock, Plane, ScanLine, Ticket, type LucideIcon } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { AppText } from '../components/AppText';
import { Badge } from '../components/Badge';
import { IconTile } from '../components/Controls';
import { ErrorBanner } from '../components/ErrorBanner';
import { FlyQLoader } from '../components/brand/FlyQLoader';
import { useBriefLoading } from '../components/brand/useBriefLoading';
import { Glass } from '../components/Glass';
import { RoundButton, ScrollScreen } from '../components/Layout';
import { useT } from '../i18n';
import { DEMO_BCBP } from '../lib/bcbp';
import { useAddTicket } from '../store/addTicket';
import { useSettings } from '../store/settings';
import { useLayout } from '../theme/responsive';
import { colors, spacing } from '../theme/tokens';
import { BrandLogo } from '../components/BrandLogo';
import { PressableScale } from '../components/press';

export function AddTicketScreen() {
  const t = useT();
  const navigation = useNavigation();
  const addTicket = useAddTicket();
  const { language, setLanguage } = useSettings();
  const { sizeClass } = useLayout();
  const [error, setError] = useState<string | null>(null);

  const [verifying, runAfterLoader] = useBriefLoading();
  const addDemo = () =>
    runAfterLoader(() => {
      const result = addTicket(DEMO_BCBP, true);
      if (!result.ok) setError(t('add.notFound', { flight: result.flight ?? '' }));
    });

  return (
    <>
      <ScrollScreen bottomInset="safeArea" column="columnNarrow">
      <View style={styles.top}>
        <View style={styles.brand}>
          <BrandLogo size={36} />
          <AppText variant="headline">{t('app.name')}</AppText>
        </View>
        <RoundButton icon={Globe} label={t('add.language')} onPress={() => setLanguage(language === 'ro' ? 'en' : 'ro')} />
      </View>

      {sizeClass !== 'compact' && <Hero />}

      <View style={styles.intro}>
        <AppText variant="title">{t('add.title')}</AppText>
        <AppText variant="body" color={colors.text2}>
          {t('add.subtitle')}
        </AppText>
      </View>

      <Option index={0} icon={Hash} title={language === 'ro' ? 'Număr de zbor' : 'Flight number'} hint={language === 'ro' ? 'Cauți un zbor real prin serverul FlyQ (ex. W43772)' : 'Look up a real flight through the FlyQ server (e.g. W43772)'} highlighted onPress={() => navigation.navigate('FlightNumber')} />
      <Option index={1} icon={ScanLine} tone="indigo" title={t('add.scan')} hint={t('add.scanHint')} onPress={() => navigation.navigate('Scan')} />
      <Option index={2} icon={ClipboardPaste} tone="indigo" title={t('add.paste')} hint={t('add.pasteHint')} onPress={() => navigation.navigate('Paste')} />
      <Option index={3} icon={Ticket} tone="violet" title={t('add.demo')} hint={t('add.demoHint')} badge={t('add.demoBadge')} onPress={addDemo} />

      {error ? <ErrorBanner message={error} /> : null}

      <View style={styles.privacy}>
        <Lock size={14} color={colors.text2} />
        <AppText variant="caption" weight="400" color={colors.text2}>
          {t('add.privacy')}
        </AppText>
      </View>
      </ScrollScreen>
      {verifying ? <FlyQLoader variant="overlay" message={t('loader.ticket')} /> : null}
    </>
  );
}

function Option({
  icon,
  title,
  hint,
  badge,
  highlighted,
  tone = 'soft',
  onPress,
  index,
}: {
  tone?: 'soft' | 'indigo' | 'violet';
  icon: LucideIcon;
  title: string;
  hint: string;
  badge?: string;
  highlighted?: boolean;
  onPress: () => void;
  index: number;
}) {
  return (
    <Animated.View entering={FadeInDown.delay(60 * index).duration(380)}>
      <PressableScale onPress={onPress} accessibilityRole="button" accessibilityLabel={`${title}. ${hint}`}>
        <Glass radius={22} style={[styles.option, highlighted && styles.optionHl]}>
          <IconTile icon={icon} tone={highlighted ? 'accent' : tone} size={48} />
          <View style={styles.optionText}>
            <View style={styles.optionTitle}>
              <AppText variant="headline">{title}</AppText>
              {badge ? <Badge label={badge} /> : null}
            </View>
            <AppText variant="caption" weight="400" color={colors.text2}>
              {hint}
            </AppText>
          </View>
          <ChevronRight size={20} color={colors.text3} />
        </Glass>
      </PressableScale>
    </Animated.View>
  );
}

// Evantaiul de bilete: două bilete-exemplu în spate, rotite, și biletul demo în față, cu detalii
function Hero() {
  const t = useT();
  return (
    <View style={styles.hero} accessible={false} importantForAccessibility="no-hide-descendants">
      <Glass radius={22} style={[styles.miniPass, styles.miniBack]}>
        <AppText variant="label">CRA → OTP</AppText>
      </Glass>
      <Glass radius={22} style={[styles.miniPass, styles.miniMid]}>
        <AppText variant="label">CRA → BCN</AppText>
      </Glass>
      <Glass tone="strong" radius={24} style={[styles.miniPass, styles.miniFront]}>
        <View style={styles.miniRoute}>
          <AppText variant="title">CRA</AppText>
          <Plane size={20} color={colors.accent} />
          <AppText variant="title">LTN</AppText>
        </View>
        <View style={styles.miniLine}>
          <MiniCell label={t('flight.title')} value="W6 3541" />
          <MiniCell label={t('pass.gate')} value="3" />
          <MiniCell label={t('pass.seat')} value="14C" />
        </View>
        <View style={styles.miniLine}>
          <AppText variant="headline" tabular>10:40</AppText>
          <AppText variant="caption" color={colors.textMuted}>→</AppText>
          <AppText variant="headline" tabular>11:50</AppText>
        </View>
      </Glass>
    </View>
  );
}

function MiniCell({ label, value }: { label: string; value: string }) {
  return (
    <View>
      <AppText variant="label">{label}</AppText>
      <AppText variant="caption" weight="700">{value}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brand: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  hero: { height: 214, marginTop: spacing.xs, alignItems: 'center' },
  miniPass: { position: 'absolute', width: 250, padding: spacing.md, gap: spacing.sm },
  miniBack: { top: 0, height: 150, width: 210, transform: [{ rotate: '-7deg' }, { translateX: -64 }], opacity: 0.8 },
  miniMid: { top: 6, height: 150, width: 210, alignItems: 'flex-end', transform: [{ rotate: '5deg' }, { translateX: 64 }], opacity: 0.9 },
  // Biletul din față e opac, ca să nu se vadă prin el cele din spate
  miniFront: { top: 54, backgroundColor: colors.surfaceOpaque, boxShadow: `0 16px 36px ${colors.shadowHero}` },
  miniRoute: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  miniLine: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  intro: { gap: spacing.sm },
  option: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg, padding: spacing.lg },
  optionHl: { borderColor: colors.accent, borderWidth: 2 },
  optionText: { flex: 1, gap: 2 },
  optionTitle: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  privacy: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, marginTop: 'auto', paddingTop: spacing.md },
});
