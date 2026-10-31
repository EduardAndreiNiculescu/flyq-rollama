import { CommonActions, useNavigation } from '@react-navigation/native';
import { Search } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { AppText } from '../components/AppText';
import { Button } from '../components/Button';
import { ErrorBanner } from '../components/ErrorBanner';
import { Glass } from '../components/Glass';
import { ScrollScreen, ScreenHeader } from '../components/Layout';
import { useLanguage } from '../i18n';
import { addLiveFlight } from '../services/live/addLive';
import { useLive } from '../store/live';
import { colors, radii, spacing } from '../theme/tokens';

/**
 * Real testing: type a flight number and the app asks the FlyQ server for it (which checks the data providers), then makes it the active ticket
 * instead of the Craiova - Luton demo. IATA and ICAO numbers both work (W43772, W4 3772, WZZ3101); the date defaults to today.
 */
export function FlightNumberScreen() {
  const ro = useLanguage() === 'ro';
  const navigation = useNavigation();
  const flyqKey = useLive(s => s.flyqKey);
  const setFlyqKey = useLive(s => s.setFlyqKey);
  const setBackend = useLive(s => s.setBackend);
  const [number, setNumber] = useState('');
  const [date, setDate] = useState('');
  const [keyDraft, setKeyDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    if (!flyqKey && keyDraft.trim()) setFlyqKey(keyDraft);
    if (!flyqKey && !keyDraft.trim()) return setError(ro ? 'Introdu cheia aplicației FlyQ (o primești de la echipa de backend).' : 'Enter the FlyQ app key (from the backend team).');
    if (!number.trim()) return setError(ro ? 'Scrie numărul zborului.' : 'Type the flight number.');
    setBusy(true);
    setBackend('flyq');
    const r = await addLiveFlight(number, date.trim() || undefined);
    setBusy(false);
    if (!r.ok) return setError(r.message);
    navigation.dispatch(CommonActions.reset({ index: 0, routes: [{ name: 'Main' }] }));
  };

  return (
    <ScrollScreen bottomInset="safeArea" column="columnNarrow">
      <ScreenHeader title={ro ? 'Număr de zbor' : 'Flight number'} subtitle={ro ? 'Zbor real, de la serverul FlyQ' : 'A real flight, from the FlyQ server'} onBack={() => navigation.goBack()} />
      <AppText variant="body" color={colors.text2}>
        {ro ? 'Scrie numărul zborului ca pe bilet (W43772, W4 3772) sau codul ICAO (WZZ3101). Spațiile și literele mari sau mici nu contează.' : 'Type the flight number as on the ticket (W43772, W4 3772) or the ICAO code (WZZ3101). Spaces and letter case do not matter.'}
      </AppText>

      <Field label={ro ? 'Număr de zbor' : 'Flight number'} value={number} onChange={setNumber} placeholder="W43772" autoCapitalize="characters" />
      <Field label={ro ? 'Data plecării (opțional, AAAA-LL-ZZ; implicit azi)' : 'Departure date (optional, YYYY-MM-DD; default today)'} value={date} onChange={setDate} placeholder="2026-11-01" keyboardType="numbers-and-punctuation" />
      {!flyqKey ? <Field label={ro ? 'Cheie aplicație FlyQ (rămâne doar pe acest telefon)' : 'FlyQ app key (stays on this phone)'} value={keyDraft} onChange={setKeyDraft} secure /> : null}

      {error ? <ErrorBanner message={error} /> : null}
      <Button label={busy ? (ro ? 'Caut…' : 'Looking up…') : ro ? 'Caută și adaugă zborul' : 'Look up and add the flight'} icon={Search} onPress={() => void submit()} disabled={busy} />
      <AppText variant="caption" weight="400" color={colors.textMuted}>
        {ro ? 'Aplicația cere zborul serverului FlyQ, care îl verifică la furnizorii de date. Dacă serverul nu găsește zborul, nu se inventează nimic.' : 'The app asks the FlyQ server, which checks the data providers. If the server cannot find the flight, nothing is made up.'}
      </AppText>
    </ScrollScreen>
  );
}

function Field({ label, value, onChange, secure, placeholder, autoCapitalize = 'none', keyboardType }: { label: string; value: string; onChange: (v: string) => void; secure?: boolean; placeholder?: string; autoCapitalize?: 'none' | 'characters'; keyboardType?: 'default' | 'numbers-and-punctuation' }) {
  return (
    <View style={styles.field}>
      <AppText variant="caption" color={colors.text2}>{label}</AppText>
      <Glass radius={radii.md} style={styles.inputWrap}>
        <TextInput style={styles.input} value={value} onChangeText={onChange} secureTextEntry={secure} autoCapitalize={autoCapitalize} autoCorrect={false} keyboardType={keyboardType} placeholder={placeholder} placeholderTextColor={colors.text3} accessibilityLabel={label} />
      </Glass>
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: 4 },
  inputWrap: { paddingHorizontal: spacing.md },
  input: { minHeight: 46, color: colors.text, fontSize: 16 },
});
