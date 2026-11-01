import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Image, Platform, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { useLanguage, useT } from '../i18n';
import { colors, radii } from '../theme/tokens';
import type { Airport, FlightPosition, Landmark } from '../types';
import { FlyQLoader } from './brand/FlyQLoader';
import { FlightRouteMap } from './FlightRouteMap';
import { GradientFill } from './GradientFill';

// Pagina hărții și datele ei offline stau în android/app/src/main/assets/flightmap (vezi scripts/flightmap-assets.js)
const SOURCE = { uri: 'file:///android_asset/flightmap/index.html' };
// Capitale arătate doar ca reper; cele de lângă aeroporturile demo (Londra, București) ar acoperi pastilele
const CONTEXT_CITIES = ['Paris', 'Berlin', 'Rome', 'Warsaw', 'Madrid', 'Prague', 'Amsterdam'];
// Dacă harta nu răspunde în acest timp, rămâne harta desenată
const READY_TIMEOUT_MS = 25000;
const POSITION_EVERY_MS = 1000;
// Captură a globului real pentru zborul demo (CRA → LTN, în română), afișată imediat cât se încarcă harta,
// ca să nu aștepți niciodată un card gol. Pentru alt zbor sau altă limbă rămâne cerul cu logoul animat.
// Se reface (captură a cardului de pe emulator, decupată) după orice schimbare de aspect a globului.
const POSTER = { from: 'CRA', to: 'LTN', lang: 'ro', image: require('../assets/flightmap-poster.jpg') };
const SKY = [colors.globeSky, colors.globeSky2, colors.globeHorizon, colors.globeFog] as const;
// În tipurile react-native-webview, P = undefined face toate prop-urile „never”; îl fixăm la object
const Web = WebView<object>;

interface Props {
  from: Airport;
  to: Airport;
  landmarks: Landmark[];
  position: FlightPosition | null;
  accessibilityLabel: string;
  estimateLabel: string;
  /** Textul din pastila aeroportului de plecare, ex. „Decolare 10:40” */
  departureLabel: string;
  arrivalLabel: string;
}

type Status = 'loading' | 'ready' | 'failed';

const positionPayload = (p: FlightPosition | null) => (p ? { lat: p.lat, lon: p.lon, progress: p.progress, source: p.source } : null);

// Harta de zbor pe glob: hartă reală MapLibre GL într-un WebView, cu relief, atmosferă și ruta pe arc de cerc mare.
// Merge offline (tot ce îi trebuie e în aplicație). Dacă WebView-ul sau WebGL lipsesc, arată harta desenată în SVG.
export const FlightGlobeMap = memo(function GlobeMap(props: Props) {
  const { from, to, landmarks, position, accessibilityLabel, estimateLabel, departureLabel, arrivalLabel } = props;
  const t = useT();
  const language = useLanguage();
  const poster = from.code === POSTER.from && to.code === POSTER.to && language === POSTER.lang ? POSTER.image : null;
  const reduceMotion = useReducedMotion();
  const web = useRef<InstanceType<typeof Web>>(null);
  const mountedAt = useRef(Date.now());
  const latest = useRef(position);
  latest.current = position;
  const [status, setStatus] = useState<Status>(Platform.OS === 'android' ? 'loading' : 'failed');
  const [attempt, setAttempt] = useState(0);
  // O eroare sau o întârziere (telefon ocupat la pornire) nu duce direct la harta desenată: mai încercăm o dată
  const giveUp = useCallback(() => (attempt < 1 ? setAttempt(a => a + 1) : setStatus('failed')), [attempt]);
  const opacity = useSharedValue(0);
  const fade = useAnimatedStyle(() => ({ opacity: opacity.value }));

  // Tot ce nu se schimbă în zbor; poziția merge separat, ca harta să nu se reîncarce
  const config = useMemo(
    () =>
      JSON.stringify({
        lang: language,
        from: { code: from.code, lat: from.lat, lon: from.lon },
        to: { code: to.code, lat: to.lat, lon: to.lon },
        landmarks: landmarks.map(l => ({ name: l.name, lat: l.lat, lon: l.lon, kind: l.kind })),
        contextCities: CONTEXT_CITIES,
        departureLabel,
        arrivalLabel,
        estimateLabel,
        colors: {
          land: colors.globeLand, water: colors.globeWater, border: colors.globeBorder, text: colors.globeText, waterText: colors.globeWaterText,
          halo: colors.globeHalo, relief: colors.globeRelief, reliefAccent: colors.globeReliefAccent, mountain: colors.mapMountain,
          sky: colors.globeSky, sky2: colors.globeSky2, horizon: colors.globeHorizon, fog: colors.globeFog,
          accent: colors.accent, accentText: colors.accentText, accentSoft: colors.accentLine, accentGlow: colors.accentGlow,
          violet: colors.accentViolet, warning: colors.warning, warningText: colors.warningText,
        },
      }),
    [language, from, to, landmarks, departureLabel, arrivalLabel, estimateLabel],
  );
  const inject = useMemo(() => `window.__FLYQ__=${config};window.__FLYQ__.position=${JSON.stringify(positionPayload(latest.current))};true;`, [config]);

  // O hartă nouă (altă limbă, alt zbor) pornește din nou de la „se încarcă”
  useEffect(() => {
    opacity.value = 0;
    setStatus(s => (s === 'failed' ? s : 'loading'));
  }, [config, attempt, opacity]);

  useEffect(() => {
    if (status !== 'loading') return;
    const timer = setTimeout(() => {
      if (__DEV__) console.log('globe timeout');
      giveUp();
    }, READY_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [status, config, attempt, giveUp]);

  // Poziția vine des (la 0,5 s în demo); harta o primește cel mult o dată pe secundă, mereu pe cea mai nouă
  const lastSent = useRef(0);
  useEffect(() => {
    if (status !== 'ready') return;
    const send = () => {
      lastSent.current = Date.now();
      web.current?.injectJavaScript(`window.flyq&&window.flyq.setPosition(${JSON.stringify(positionPayload(latest.current))});true;`);
    };
    const wait = POSITION_EVERY_MS - (Date.now() - lastSent.current);
    if (wait <= 0) {
      send();
      return;
    }
    const timer = setTimeout(send, wait);
    return () => clearTimeout(timer);
  }, [position, status]);

  const onMessage = (e: WebViewMessageEvent) => {
    if (__DEV__) console.log('globe msg', e.nativeEvent.data.slice(0, 200));
    let msg: { type?: string };
    try {
      msg = JSON.parse(e.nativeEvent.data);
    } catch {
      return;
    }
    if (msg.type === 'ready') {
      if (__DEV__) console.log('globe ready', Date.now() - mountedAt.current, 'ms', JSON.stringify(msg));
      setStatus('ready');
      opacity.value = withTiming(1, { duration: reduceMotion ? 0 : 450 });
    } else if (msg.type === 'error') {
      giveUp();
    }
  };

  // Dacă procesul WebView-ului moare (memorie puțină), încercăm o dată din nou, apoi rămâne harta desenată
  const onGone = giveUp;

  if (status === 'failed') {
    return <FlightRouteMap from={from} to={to} landmarks={landmarks} position={position} accessibilityLabel={accessibilityLabel} estimateLabel={estimateLabel} departureLabel={departureLabel} arrivalLabel={arrivalLabel} />;
  }

  return (
    <View style={styles.card} accessible accessibilityRole="image" accessibilityLabel={accessibilityLabel}>
      <GradientFill colors={SKY} vertical />
      {poster ? <Image source={poster} style={styles.poster} resizeMode="cover" fadeDuration={0} accessibilityIgnoresInvertColors /> : null}
      {/* Harta nu primește atingeri: derularea ecranului trece prin ea */}
      <Animated.View style={[StyleSheet.absoluteFill, fade]} pointerEvents="none">
        <Web
          key={`${attempt}-${config}`}
          ref={web}
          source={SOURCE}
          originWhitelist={['*']}
          allowFileAccess
          allowFileAccessFromFileURLs
          injectedJavaScriptBeforeContentLoaded={inject}
          onMessage={onMessage}
          onError={ev => {
            if (__DEV__) console.log('globe webview error', ev.nativeEvent.description);
            giveUp();
          }}
          onRenderProcessGone={onGone}
          javaScriptEnabled
          scrollEnabled={false}
          overScrollMode="never"
          setBuiltInZoomControls={false}
          showsHorizontalScrollIndicator={false}
          showsVerticalScrollIndicator={false}
          importantForAccessibility="no-hide-descendants"
          style={styles.web}
        />
      </Animated.View>
      {/* Cât se încarcă globul, același loader ca la harta terminalului; se estompează când harta e gata */}
      {status === 'loading' && !poster && <FlyQLoader variant="bare" label={t('loader.globe')} />}
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    overflow: 'hidden',
    borderRadius: radii.xl,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: colors.glassEdgeLit,
    backgroundColor: colors.globeHorizon,
    aspectRatio: 0.82,
    boxShadow: `0 16px 36px ${colors.shadowHero}`,
  },
  web: { flex: 1, backgroundColor: 'transparent' },
  // Dimensiuni explicite: cu absoluteFill singur, imaginea rămânea la mărimea ei în pixeli
  poster: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' },
});
