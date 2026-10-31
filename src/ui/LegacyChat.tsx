import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, Pressable, SafeAreaView,
  StyleSheet, Text, TextInput, View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useKeepAwake } from 'expo-keep-awake';
import { FlightFlowAssistant, type NavigationHandler } from '../core/assistant';
import type { PassengerContext } from '../core/types';
import { detectLang } from '../core/prompt';
import { correctionNote, metaLine, sourceLabel } from '../ui/format';
import { LlamaEngine } from '../llm/llamaEngine';
import { checkModel, provisionModel, type ModelStatus } from '../llm/modelProvision';

type Msg = {
  id: string; role: 'user' | 'assistant'; text: string;
  pending?: boolean; // true until ask() resolves; only then may the bubble show '…'
  badge?: string; meta?: string; note?: string;
};

const engine = new LlamaEngine();
// MOCK PassengerContext: fictive demo data, to be replaced by the map module (see docs/INTEGRATION.md).
const CONTEXT: PassengerContext = { flightNumber: 'DEMO123', airportCode: 'CRA', journeyStage: 'airside', connectionAvailable: false };
// MOCK NavigationHandler: only logs; the map module will provide the real one (see docs/INTEGRATION.md).
const MOCK_NAV: NavigationHandler = { openAirportMap: (r) => console.log('[MOCK NAV] open map ->', r.destination) };
const assistant = new FlightFlowAssistant(engine, { nav: MOCK_NAV });

export default function App() {
  useKeepAwake();
  const [status, setStatus] = useState<ModelStatus | 'checking' | 'downloading' | 'loading' | 'loaded'>('checking');
  const [error, setError] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const idRef = useRef(0);

  const loadModel = useCallback(async (path: string) => {
    setStatus('loading');
    try {
      await engine.load(path);
      setStatus('loaded');
    } catch (e) {
      setError(`Model load failed: ${String(e)}`);
      setStatus({ state: 'corrupt', reason: String(e) });
    }
  }, []);

  useEffect(() => {
    checkModel().then((s) => (s.state === 'ready' ? loadModel(s.path) : setStatus(s)));
  }, [loadModel]);

  const download = async () => {
    setError(null);
    setStatus('downloading');
    try {
      const s = await provisionModel();
      if (s.state === 'ready') await loadModel(s.path);
      else setStatus(s);
    } catch (e) {
      setError(`Download failed (needs internet): ${String(e)}`);
      setStatus({ state: 'missing' });
    }
  };

  const send = async () => {
    const q = input.trim();
    if (!q || busy) return;
    setInput('');
    setBusy(true);
    const uid = `m${idRef.current++}`;
    const aid = `m${idRef.current++}`;
    setMsgs((m) => [...m, { id: uid, role: 'user', text: q }, { id: aid, role: 'assistant', text: '', pending: true }]);
    try {
      const r = await assistant.ask(q, CONTEXT, (partial) =>
        setMsgs((m) => m.map((x) => (x.id === aid ? { ...x, text: partial } : x))),
      );
      const lang = detectLang(q);
      const done: Partial<Msg> = {
        pending: false,
        badge: sourceLabel(r, lang),
        meta: metaLine(r) || undefined,
        note: correctionNote(r, lang) || undefined,
      };
      setMsgs((m) => m.map((x) => (x.id === aid ? { ...x, ...done, text: r.text || x.text } : x)));
    } catch (e) {
      setMsgs((m) => m.map((x) => (x.id === aid ? { ...x, pending: false, text: `⚠️ ${String(e)}` } : x)));
    } finally {
      setBusy(false);
    }
  };

  if (status !== 'loaded') {
    return (
      <SafeAreaView style={s.center}>
        <StatusBar style="dark" />
        <Text style={s.title}>FlightFlow AI</Text>
        {(status === 'checking' || status === 'loading' || status === 'downloading') && (
          <>
            <ActivityIndicator size="large" />
            <Text style={s.sub}>
              {status === 'checking' ? 'Checking local model…' : status === 'loading' ? 'Loading model on device…' : 'Downloading model (≈2.5 GB, keep app open, one-time)…'}
            </Text>
          </>
        )}
        {typeof status === 'object' && status.state !== 'ready' && (
          <>
            <Text style={s.sub}>
              {status.state === 'manual'
                ? 'The distilled FlightFlow model must be copied manually; do not substitute the public base model.'
                : status.state === 'missing'
                ? 'The offline model is not on this phone yet. Download it once (Wi-Fi), then Airplane Mode works.'
                : `Model problem: ${status.reason}`}
            </Text>
            {status.state !== 'manual' && <Pressable style={s.btn} accessibilityRole="button" accessibilityLabel="Download model" onPress={download}><Text style={s.btnTxt}>Download model</Text></Pressable>}
          </>
        )}
        {error && <Text style={s.err}>{error}</Text>}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.root}>
      <StatusBar style="dark" />
      <Text style={s.header}>FlightFlow · on-device AI</Text>
      <Text style={s.demo} accessibilityRole="text">date demo (fictive) · demo data is fictional</Text>
      <FlatList
        data={msgs}
        keyExtractor={(m) => m.id}
        contentContainerStyle={{ padding: 12 }}
        renderItem={({ item }) => (
          <View style={[s.bubble, item.role === 'user' ? s.user : s.bot]}>
            <Text style={item.role === 'user' ? s.userTxt : s.botTxt}>
              {item.text || (item.pending ? '…' : '(fără răspuns / no answer)')}
            </Text>
            {item.role === 'assistant' && !item.pending && !!item.badge && <Text style={s.badge}>{item.badge}</Text>}
            {!!item.note && <Text style={s.note}>{item.note}</Text>}
            {!!item.meta && <Text style={s.meta}>{item.meta}</Text>}
          </View>
        )}
      />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={s.row}>
          <TextInput style={s.input} accessibilityLabel="Message input / Mesaj" value={input} onChangeText={setInput} placeholder="Întreabă / Ask…" onSubmitEditing={send} editable={!busy} />
          {busy ? (
            <Pressable style={[s.btn, s.stop]} accessibilityRole="button" accessibilityLabel="Stop generating / Oprește" onPress={() => assistant.stop()}><Text style={s.btnTxt}>Stop</Text></Pressable>
          ) : (
            <Pressable style={s.btn} accessibilityRole="button" accessibilityLabel="Send message / Trimite" onPress={send}><Text style={s.btnTxt}>Send</Text></Pressable>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f6f7f9' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 14, backgroundColor: '#fff' },
  title: { fontSize: 26, fontWeight: '700' },
  sub: { fontSize: 15, textAlign: 'center', color: '#444' },
  err: { color: '#b00020', textAlign: 'center' },
  header: { textAlign: 'center', fontSize: 12, color: '#666', paddingVertical: 6 },
  bubble: { maxWidth: '85%', padding: 10, borderRadius: 14, marginVertical: 4 },
  user: { alignSelf: 'flex-end', backgroundColor: '#0a5cff' },
  bot: { alignSelf: 'flex-start', backgroundColor: '#fff' },
  userTxt: { color: '#fff', fontSize: 16 },
  botTxt: { color: '#111', fontSize: 16 },
  demo: { textAlign: 'center', fontSize: 12, color: '#8a5a00', backgroundColor: '#fff4d6', paddingVertical: 4 },
  badge: { fontSize: 12, color: '#555', marginTop: 6, fontWeight: '600' },
  note: { fontSize: 12, color: '#777', fontStyle: 'italic', marginTop: 2 },
  meta: { fontSize: 12, color: '#777', marginTop: 2 },
  row: { flexDirection: 'row', padding: 8, gap: 8, alignItems: 'center' },
  input: { flex: 1, backgroundColor: '#fff', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10, fontSize: 16 },
  btn: { backgroundColor: '#0a5cff', paddingHorizontal: 18, paddingVertical: 10, borderRadius: 20 },
  stop: { backgroundColor: '#c62828' },
  btnTxt: { color: '#fff', fontWeight: '600' },
});
