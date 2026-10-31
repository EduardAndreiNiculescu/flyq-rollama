import { useNavigation } from '@react-navigation/native';
import { Download, Gauge, PlaneTakeoff, Plug, Search } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { AppText } from '../components/AppText';
import { Button } from '../components/Button';
import { Chip, Segmented, Toggle } from '../components/Controls';
import { Glass } from '../components/Glass';
import { ScreenHeader, ScrollScreen } from '../components/Layout';
import { generateBench } from '../bench/questions';
import { runBenchmark, summarize, type BenchResult } from '../bench/runner';
import { adapterLoaded, downloadDeviceModel, deviceModelState, loadDeviceModel } from '../services/live/DeviceAssistantService';
import { flightData } from '../services';
import { useLanguage } from '../i18n';
import { addDemoFlight, addLiveFlight } from '../services/live/addLive';
import { recordFor } from '../services/live/DeviceAssistantService';
import { formatLocalTime } from '../lib/time';
import { endFlightActivity, startFlightActivity } from '../services/live/liveActivity';
import { deviceToken, registerForFlight, testFlyqKey } from '../services/live/push';
import { pingGateway, sendBench } from '../services/live/gatewayClient';
import { checkModel, specForTier } from '../llm/modelProvision';
import { useLive, type AssistantSource, type ModelTier, type TrackerSource } from '../store/live';
import { useActiveTicket } from '../store/tickets';
import { colors, radii, spacing } from '../theme/tokens';

function Field({ label, value, onChange, secure, placeholder }: { label: string; value: string; onChange: (v: string) => void; secure?: boolean; placeholder?: string }) {
  return (
    <View style={styles.field}>
      <AppText variant="caption" color={colors.text2}>
        {label}
      </AppText>
      <Glass radius={radii.md} style={styles.inputWrap}>
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={onChange}
          secureTextEntry={secure}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder={placeholder}
          placeholderTextColor={colors.text3}
          accessibilityLabel={label}
        />
      </Glass>
    </View>
  );
}

export function LiveScreen() {
  const navigation = useNavigation();
  const live = useLive();
  const ticket = useActiveTicket();
  const [status, setStatus] = useState<string | null>(null);
  const [flightNo, setFlightNo] = useState('');
  const [busy, setBusy] = useState(false);
  const [model, setModel] = useState<string>('…');
  const [bench, setBench] = useState<string[] | null>(null);
  const [benchBusy, setBenchBusy] = useState(false);
  const language = useLanguage();
  const [pushStatus, setPushStatus] = useState<string | null>(null);
  const [pushToken, setPushToken] = useState<string | null>(null);

  const enablePush = async () => {
    setPushStatus('Cer permisiunea…');
    const flight = ticket ? flightData.getFlight(ticket.flightId) : null;
    if (!flight) {
      const t = await deviceToken().catch(() => null);
      setPushToken(t);
      return setPushStatus(t ? 'Token APNs citit. Nu e niciun bilet activ, deci nu m-am abonat la un zbor.' : 'Notificările nu sunt permise (sau nu e iPhone).');
    }
    const r = await registerForFlight(recordFor(flight), language);
    if ('token' in r) setPushToken(r.token);
    setPushStatus(
      r.state === 'registered' ? `Abonat la ${r.flightId}.` : r.state === 'server_off' ? 'Serverul FlyQ are push-ul oprit (FEATURE_DISABLED). Token-ul e citit; notificările pleacă după ce serverul e configurat.' : r.state === 'no_key' ? 'Lipsește cheia FlyQ (secțiunea Sursa zborurilor).' : r.state === 'denied' ? 'Notificările nu sunt permise în Setări.' : `Eroare: ${r.reason}`,
    );
  };

  /** Needs the push subscription first (the activity token is sent to it): tap "Activează notificările", then this. */
  const startActivity = async () => {
    const flight = ticket ? flightData.getFlight(ticket.flightId) : null;
    if (!flight) return setPushStatus('Nu e niciun bilet activ: adaugă un bilet ca să pornesc cardul.');
    setPushStatus('Pornesc cardul…');
    const from = flightData.getAirport(flight.from);
    const boarding = from && flight.boardingUtc ? { time: formatLocalTime(flight.boardingUtc, from.utcOffsetMin), epoch: Math.floor(new Date(flight.boardingUtc).getTime() / 1000) } : null;
    setPushStatus((await startFlightActivity(recordFor(flight), boarding)).message);
  };

  useEffect(() => {
    deviceModelState().then(s => setModel(live.modelTier === 'no-ai' ? 'fără model (router pur)' : s === 'ready' ? 'descărcat' : s === 'manual' ? 'transfer manual necesar' : s === 'missing' ? 'lipsește' : 'fișier corupt'), () => setModel('necunoscut'));
  }, [live.modelTier]);

  const test = async () => {
    setStatus('Testez…');
    setStatus((await pingGateway()).detail);
  };

  const addLive = async (raw: string) => {
    setBusy(true);
    setStatus(`Caut ${raw}…`);
    const r = await addLiveFlight(raw);
    setStatus(r.ok ? `${r.message} Pornește „Zbor” ca să-l urmărești.` : r.message);
    setBusy(false);
    if (r.ok) navigation.navigate('Main');
  };

  // 20 new questions each time (human-style typos and slang), run in place; the results go to the laptop as a file.
  const runBench = async () => {
    if (!ticket) {
      setBench(['Adaugă mai întâi un zbor (demo sau real).']);
      return;
    }
    setBenchBusy(true);
    const seed = Date.now() % 1_000_000;
    const qs = generateBench(20, seed);
    const done: BenchResult[] = [];
    try {
      await runBenchmark(qs, {
        onItem: r => {
          done.push(r);
          setBench([`Rulez ${done.length}/${qs.length}…`, ...done.slice(-4).map(x => `${x.q} → ${(x.ms / 1000).toFixed(1)} s`)]);
        },
      });
      const s = summarize(done);
      let sent = 'netrimis (gateway indisponibil)';
      try {
        sent = 'trimis la laptop: ' + (await sendBench({ source: live.assistantSource, adapter: adapterLoaded(), device: 'iPhone', seed, summary: s }, done.map(d => ({ q: d.q, answer: d.answer, ms: d.ms, mode: d.mode, modelUsed: d.modelUsed, path: d.path, timing: d.timing, tokensPerSecond: d.tokensPerSecond, ttftMs: d.ttftMs, tools: d.tools }))));
      } catch {
        /* the summary stays on screen */
      }
      setBench([
        `SURSĂ ${live.assistantSource}${adapterLoaded() ? ' + adaptor' : ''}: mediană ${s.medianMs ? (s.medianMs / 1000).toFixed(1) : '–'} s · ${s.medianTps ? s.medianTps.toFixed(1) + ' tok/s' : 'fără model'} · primul token ${s.medianTtftMs ? (s.medianTtftMs / 1000).toFixed(1) + ' s' : '–'}`,
        ...(s.toolScored ? [`unelte alese corect: ${s.toolOk}/${s.toolScored}`] : []),
        sent,
      ]);
    } catch (e) {
      setBench([`Benchmark oprit: ${e instanceof Error ? e.message : 'eroare'}`]);
    } finally {
      setBenchBusy(false);
    }
  };

  const assistantOptions: { value: AssistantSource; label: string }[] = [
    { value: 'mock', label: 'Mock' },
    { value: 'laptop', label: 'Laptop' },
    { value: 'device', label: 'Tel.' },
    { value: 'deviceTools', label: 'Tel.+unelte' },
  ];
  const modelTierOptions: { value: ModelTier; label: string }[] = [
    { value: 'no-ai', label: 'Fără AI' },
    { value: 'rollama', label: 'RoLlama' },
  ];
  const trackerOptions: { value: TrackerSource; label: string }[] = [
    { value: 'mock', label: 'Simulat' },
    { value: 'live', label: 'Zbor real' },
  ];

  return (
    <ScrollScreen bottomInset="safeArea" column="columnWide">
      <ScreenHeader title="Mod test" subtitle="Zbor real, asistent real, comandat de pe laptop" onBack={() => navigation.goBack()} />

      <View style={styles.section}>
        <AppText variant="label">Zbor real (prin gateway)</AppText>
        <Field label="Număr de zbor" value={flightNo} onChange={setFlightNo} placeholder="ex. RO311" />
        <Button label="Caută și adaugă" icon={Search} onPress={() => addLive(flightNo)} disabled={busy || !flightNo.trim()} />
        {live.recent.length > 0 && (
          <View style={styles.chips}>
            {live.recent.map(n => (
              <Chip key={n} label={n} onPress={() => addLive(n)} />
            ))}
          </View>
        )}
        <Button label="Zbor demo (simulat)" icon={PlaneTakeoff} variant="glass" onPress={() => setStatus(addDemoFlight().message)} />
        {status && (
          <AppText variant="caption" color={colors.text2} accessibilityLiveRegion="polite">
            {status}
          </AppText>
        )}
      </View>

      <View style={styles.section}>
        <AppText variant="label">Cine răspunde la întrebări</AppText>
        <Segmented options={assistantOptions} value={live.assistantSource} onChange={live.setAssistantSource} />
        <AppText variant="caption" color={colors.text3}>
          Mock = răspunsuri pregătite (nu e modelul). Laptop = gateway-ul de test. Tel. = fluxul aplicației (șabloane + documente). Tel.+unelte = RoLlama de pe telefon alege unealta, iar răspunsul vine din date (compozitor, nu text liber).
        </AppText>
        <AppText variant="label">Poziția avionului</AppText>
        <Segmented options={trackerOptions} value={live.trackerSource} onChange={live.setTrackerSource} />
        <AppText variant="label">Sursa zborurilor</AppText>
        <Segmented
          options={[
            { value: 'gateway', label: 'Gateway laptop' },
            { value: 'flyq', label: 'Server FlyQ' },
          ]}
          value={live.backend}
          onChange={live.setBackend}
        />
        {live.backend === 'flyq' && (
          <>
            <Field label="Cheie aplicație FlyQ (rămâne doar pe acest telefon)" value={live.flyqKey} onChange={live.setFlyqKey} secure />
            <AppText variant="caption" color={colors.text3}>
              {live.flyqKey ? (live.flyqSession ? 'FlyQ: sesiune activă.' : 'FlyQ: cheie setată, sesiune la prima cerere.') : 'FlyQ: lipsește cheia, zborurile nu se pot încărca.'}
            </AppText>
          </>
        )}
      </View>

      <View style={styles.section}>
        <AppText variant="label">Notificări iOS (APNs, prin serverul FlyQ)</AppText>
        <Button label="Testează cheia FlyQ" variant="glass" size="sm" onPress={async () => setPushStatus(await testFlyqKey())} />
        <Button label="Activează notificările" variant="glass" size="sm" onPress={enablePush} />
        <Button label="Pornește cardul Live Activity" variant="glass" size="sm" onPress={startActivity} />
        <Button label="Oprește cardul" variant="glass" size="sm" onPress={async () => setPushStatus((await endFlightActivity()).message)} />
        {pushStatus ? <AppText variant="caption" color={colors.text3}>{pushStatus}</AppText> : null}
        {pushToken ? (
          <>
            <AppText variant="caption" color={colors.text3}>Token APNs (pentru un test de pe laptop: scripts/push-test.ts):</AppText>
            <AppText variant="caption" selectable>{pushToken}</AppText>
          </>
        ) : null}
      </View>

      <View style={styles.section}>
        <AppText variant="label">Conexiune la laptop (gateway)</AppText>
        <Field label="Adresă" value={live.baseUrl} onChange={live.setBaseUrl} placeholder="http://192.168.x.x:18090" />
        <Field label="Token (dacă gateway-ul a fost pornit cu GATEWAY_TOKEN)" value={live.token} onChange={live.setToken} secure />
        <Button label="Testează conexiunea" icon={Plug} variant="glass" onPress={test} />
        <View style={styles.row}>
          <AppText variant="caption" color={colors.text2} style={styles.flex}>
            Laptopul poate comanda aplicația (benchmark, întrebări, zbor, model) cât timp e deschisă
          </AppText>
          <Toggle value={live.linkEnabled} onChange={live.setLinkEnabled} label="Legătură cu laptopul" />
        </View>
      </View>

      <View style={styles.section}>
        <AppText variant="label">Model AI (telefon): RoLlama</AppText>
        <Segmented
          options={modelTierOptions}
          value={live.modelTier}
          onChange={async tier => {
            live.setModelTier(tier);
            const st = await checkModel(tier);
            setModel(tier === 'no-ai' ? 'fără model (router pur)' : st.state === 'ready' ? 'descărcat' : st.state === 'manual' ? 'transfer manual necesar' : st.state === 'missing' ? 'lipsește' : 'fișier corupt');
          }}
        />
        <AppText variant="caption" color={colors.text3}>
          {live.modelTier === 'no-ai'
            ? 'Fără AI: router deterministic + compozitor (0 MB RAM, latență ~0.07 ms).'
            : specForTier(live.modelTier)?.label ?? ''}
        </AppText>
        <AppText variant="label">
          Stare model: {model}
          
        </AppText>
        {live.modelTier !== 'no-ai' && (
          <View style={styles.row}>
            <Button
              label={specForTier(live.modelTier)?.url ? `Verifică RoLlama` : `Verifică RoLlama`}
              icon={Download}
              variant="glass"
              size="sm"
              style={styles.flex}
              onPress={async () => {
                setModel('se descarcă…');
                const r = await downloadDeviceModel(live.modelTier);
                setModel(r.state === 'ready' ? 'descărcat' : r.state === 'manual' ? 'transfer manual necesar' : 'eșec');
              }}
            />
            <Button
              label="Încarcă"
              variant="glass"
              size="sm"
              style={styles.flex}
              onPress={async () => {
                setModel('se încarcă…');
                setModel((await loadDeviceModel()) ? 'încărcat' : 'lipsește');
              }}
            />
          </View>
        )}
        <Button label={benchBusy ? 'Rulează…' : 'Benchmark local (20 întrebări noi)'} icon={Gauge} variant="glass" onPress={runBench} disabled={benchBusy} />
        {bench &&
          bench.map((l, i) => (
            <AppText key={i} variant="caption" color={i === 0 ? colors.text : colors.text2}>
              {l}
            </AppText>
          ))}
      </View>
    </ScrollScreen>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.md },
  field: { gap: 4 },
  inputWrap: { paddingHorizontal: spacing.md },
  input: { minHeight: 46, color: colors.text, fontSize: 16 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  row: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  flex: { flex: 1 },
});
