import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { CircleAlert, CircleCheck, Plus, Ticket } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import type { RootStackParamList } from '../app/navigation';
import { AppText } from '../components/AppText';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { ErrorBanner } from '../components/ErrorBanner';
import { FlyQLoader } from '../components/brand/FlyQLoader';
import { useBriefLoading } from '../components/brand/useBriefLoading';
import { Glass } from '../components/Glass';
import { ScrollScreen, ScreenHeader } from '../components/Layout';
import { useT, type TranslationKey } from '../i18n';
import { BCBP_FIELDS, BCBP_MANDATORY_LENGTH, DEMO_BCBP, julianToDate, maskPnr, parseBcbp } from '../lib/bcbp';
import { formatShortDate } from '../lib/time';
import { clock } from '../services';
import { addTicketMessage, useAddTicket } from '../store/addTicket';
import { useLanguage } from '../i18n';
import { colors, radii, spacing } from '../theme/tokens';

const pos = (key: (typeof BCBP_FIELDS)[number]['key']) => {
  const f = BCBP_FIELDS.find(x => x.key === key)!;
  return f.length === 1 ? `${f.start}` : `${f.start}–${f.start + f.length - 1}`;
};

export function PasteScreen() {
  const t = useT();
  const language = useLanguage();
  const navigation = useNavigation();
  const route = useRoute<RouteProp<RootStackParamList, 'Paste'>>();
  const addTicket = useAddTicket();
  const [code, setCode] = useState(route.params?.initialCode ?? '');
  const [submitError, setSubmitError] = useState<string | null>(null);

  const parsed = useMemo(() => (code.length ? parseBcbp(code) : null), [code]);
  const length = code.replace(/[\r\n]+$/, '').length;

  const [verifying, runAfterLoader] = useBriefLoading();
  const submit = () =>
    runAfterLoader(async () => {
      const result = await addTicket(code, code === DEMO_BCBP);
      if (!result.ok) setSubmitError(addTicketMessage(result, t));
    });

  return (
    <>
      <ScrollScreen bottomInset="safeArea" column="columnNarrow">
      <ScreenHeader title={t('paste.title')} titleSize="headline" onBack={() => navigation.goBack()} />
      <View style={styles.group}>
        <AppText variant="label">{t('paste.label')}</AppText>
        <Glass tone="strong" radius={radii.lg} style={[styles.inputWrap, parsed?.ok && styles.inputValid]}>
          <TextInput
            value={code}
            onChangeText={text => {
              setCode(text);
              setSubmitError(null);
            }}
            placeholder={t('paste.placeholder')}
            placeholderTextColor={colors.textMuted}
            multiline
            autoCapitalize="characters"
            autoCorrect={false}
            spellCheck={false}
            style={styles.input}
            allowFontScaling={false}
            accessibilityLabel={t('paste.label')}
          />
        </Glass>
        <View style={styles.status}>
          {parsed?.ok ? (
            <Badge label={t('paste.valid')} tone="success" icon={CircleCheck} />
          ) : parsed && !parsed.ok ? (
            <Badge label={t(`paste.err.${parsed.error}` as TranslationKey)} tone="warning" icon={CircleAlert} />
          ) : (
            <View />
          )}
          <AppText variant="caption" weight="400" color={colors.text2} tabular>
            {t('paste.chars', { count: Math.min(length, BCBP_MANDATORY_LENGTH) })}
          </AppText>
        </View>
      </View>

      {parsed?.ok && (
        <Glass style={styles.card}>
          <AppText variant="label">{t('paste.read')}</AppText>
          <Field position={pos('passengerName')} label={t('paste.passenger')} value={parsed.pass.passengerName} />
          <Field position={pos('pnr')} label={t('paste.pnr')} value={maskPnr(parsed.pass.pnr)} />
          <Field position={`${pos('from')}, ${pos('to')}`} label={t('paste.route')} value={`${parsed.pass.from} → ${parsed.pass.to}`} />
          <Field position={`${pos('carrier')}, ${pos('flightNumber')}`} label={t('paste.flight')} value={`${parsed.pass.carrier} ${parsed.pass.flightNumber}`} />
          <Field
            position={pos('julianDate')}
            label={t('paste.date')}
            value={formatShortDate(julianToDate(parsed.pass.julianDate, clock.now()).toISOString(), 0, language)}
            sub={t('paste.dayOfYear', { day: parsed.pass.julianDate })}
          />
          <Field position={pos('seat')} label={t('paste.seat')} value={parsed.pass.seat} />
          <Field position={pos('sequence')} label={t('paste.sequence')} value={parsed.pass.sequence} last />
        </Glass>
      )}

      {submitError ? <ErrorBanner message={submitError} /> : null}

      <View style={styles.actions}>
        {!code && <Button label={t('paste.useDemo')} icon={Ticket} variant="glass" onPress={() => setCode(DEMO_BCBP)} />}
        <Button label={t('paste.add')} icon={Plus} onPress={submit} disabled={!parsed?.ok} />
        <AppText variant="caption" weight="400" color={colors.text2} align="center">
          {t('paste.standard')}
        </AppText>
      </View>
      </ScrollScreen>
      {verifying ? <FlyQLoader variant="overlay" message={t('loader.ticket')} /> : null}
    </>
  );
}

// Valoarea poate avea un rând secundar estompat (de ex. „ziua 304” sub dată)
function Field({ position, label, value, sub, last }: { position: string; label: string; value: string; sub?: string; last?: boolean }) {
  return (
    <View style={[styles.field, !last && styles.fieldBorder]}>
      <View style={styles.fieldLabel}>
        <AppText variant="caption" weight="400" color={colors.textMuted} style={styles.mono}>
          {position}
        </AppText>
        <AppText variant="caption" color={colors.text2}>
          {label}
        </AppText>
      </View>
      <View style={styles.fieldValue}>
        <AppText variant="body" weight="700" align="right" numberOfLines={1}>
          {value}
        </AppText>
        {sub ? (
          <AppText variant="caption" color={colors.textMuted} align="right">
            {sub}
          </AppText>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: spacing.sm },
  inputWrap: { padding: spacing.lg },
  inputValid: { borderColor: colors.accent, borderWidth: 2 },
  input: { minHeight: 96, color: colors.text, fontSize: 15, lineHeight: 22, fontFamily: 'monospace', textAlignVertical: 'top', padding: 0 },
  status: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  card: { padding: spacing.lg, gap: 2 },
  field: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.md, paddingVertical: 7 },
  fieldBorder: { borderBottomWidth: 1, borderBottomColor: colors.line },
  fieldLabel: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  fieldValue: { flexShrink: 1 },
  mono: { fontFamily: 'monospace', minWidth: 44 },
  actions: { gap: spacing.sm, marginTop: 'auto' },
});
