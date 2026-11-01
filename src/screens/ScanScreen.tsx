import { useNavigation } from '@react-navigation/native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { CameraOff, CircleCheck, ClipboardPaste, Flashlight, Settings } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { AppState, Linking, StyleSheet, View } from 'react-native';
import Animated, { Easing, FadeIn, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { AppText } from '../components/AppText';
import { Button } from '../components/Button';
import { ErrorBanner } from '../components/ErrorBanner';
import { Screen, ScreenHeader } from '../components/Layout';
import { useT } from '../i18n';
import { DEMO_BCBP } from '../lib/bcbp';
import { haptic } from '../lib/native';
import { cameraScanner } from '../services';
import { BOARDING_PASS_BARCODES, cameraAccess } from '../services/camera/CameraBarcodeScannerService';
import { addTicketMessage, useAddTicket, type AddTicketResult } from '../store/addTicket';
import { colors, radii, spacing } from '../theme/tokens';

// Camera reală: previzualizare, cadru, lanternă. Se oprește la primul cod citit, vibrează ușor, arată „Cod citit”
// și adaugă biletul cu textul brut. Fără permisiune sau fără cameră (simulatorul) rămâne lipirea manuală.
export function ScanScreen() {
  const t = useT();
  const navigation = useNavigation();
  const addTicket = useAddTicket();
  const [permission, requestPermission, getPermission] = useCameraPermissions();
  const access = cameraAccess(permission);
  const [unavailable, setUnavailable] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const [failure, setFailure] = useState<Extract<AddTicketResult, { ok: false }> | null>(null);
  const [torch, setTorch] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const asked = useRef(false);
  const line = useSharedValue(0.5);
  const frameHeight = useSharedValue(0);
  // Cu „reducerea mișcării” activă, linia de scanare stă pe loc la mijlocul cadrului
  const reduceMotion = useReducedMotion();
  const live = access === 'granted' && !unavailable;

  // Fereastra sistemului apare o singură dată; după un refuz rămân Setările.
  useEffect(() => {
    if (access === 'ask' && !asked.current) {
      asked.current = true;
      void requestPermission();
    }
  }, [access, requestPermission]);

  // Întors din Setări: citim din nou permisiunea.
  useEffect(() => {
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') void getPermission();
    });
    return () => sub.remove();
  }, [getPermission]);

  useEffect(() => {
    if (!live) return;
    if (!reduceMotion) {
      line.value = 0;
      line.value = withRepeat(withTiming(1, { duration: 1300, easing: Easing.inOut(Easing.quad) }), -1, true);
    }
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    cameraScanner
      .scan()
      .then(read => {
        if (!active) return;
        haptic('tap');
        setCode(read);
        timer = setTimeout(() => {
          if (!active) return;
          // A scanned code is a real ticket (the demo ticket is only the demo code)
          void addTicket(read, read === DEMO_BCBP).then(result => {
            if (active && !result.ok) setFailure(result);
          });
        }, 700);
      })
      .catch(() => undefined);
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
      cameraScanner.cancel();
    };
  }, [addTicket, attempt, line, live, reduceMotion]);

  const retry = () => {
    setFailure(null);
    setCode(null);
    setAttempt(n => n + 1);
  };
  const paste = () => navigation.navigate('Paste', code ? { initialCode: code } : undefined);

  // Animăm transform (translateY), nu poziția `top`: fluid și pe telefoane vechi
  const lineStyle = useAnimatedStyle(() => ({ transform: [{ translateY: frameHeight.value * (0.08 + line.value * 0.84) }] }));

  return (
    <Screen bottomInset="safeArea" column="columnNarrow">
      <ScreenHeader title={t('scan.title')} titleSize="headline" onBack={() => navigation.goBack()} />
      <View style={styles.camera} accessible={!live} accessibilityLabel={t('scan.camera')}>
        {live ? (
          <>
            <CameraView
              style={StyleSheet.absoluteFill}
              facing="back"
              enableTorch={torch}
              barcodeScannerSettings={{ barcodeTypes: BOARDING_PASS_BARCODES }}
              // Fără handler după primul cod: camera nu mai trimite evenimente
              onBarcodeScanned={code ? undefined : cameraScanner.handleBarcode}
              onMountError={() => setUnavailable(true)}
            />
            <View style={styles.frame} onLayout={e => (frameHeight.value = e.nativeEvent.layout.height)}>
              <View style={[styles.corner, styles.tl]} />
              <View style={[styles.corner, styles.tr]} />
              <View style={[styles.corner, styles.bl]} />
              <View style={[styles.corner, styles.br]} />
              {code ? null : <Animated.View style={[styles.scanline, lineStyle]} />}
            </View>
            <View style={styles.pill} accessibilityLiveRegion="polite">
              {code ? <CircleCheck size={16} color={colors.white} /> : <View style={styles.live} />}
              <AppText variant="caption" color={colors.white}>
                {code ? t('scan.found') : t('scan.hint')}
              </AppText>
            </View>
            {code ? <Animated.View entering={FadeIn} style={styles.flash} pointerEvents="none" /> : null}
          </>
        ) : (
          <View style={styles.message}>
            {access === 'checking' || access === 'ask' ? (
              <AppText variant="body" color={colors.white} align="center">
                {t('scan.checking')}
              </AppText>
            ) : (
              <>
                <CameraOff size={32} color={colors.white} />
                <AppText variant="headline" color={colors.white} align="center">
                  {unavailable ? t('scan.unavailable') : t('scan.deniedTitle')}
                </AppText>
                <AppText variant="body" weight="400" color={colors.white} align="center">
                  {unavailable ? t('scan.unavailableHint') : t('scan.denied')}
                </AppText>
                {access === 'blocked' ? (
                  <Button label={t('scan.openSettings')} icon={Settings} variant="glass" onPress={() => void Linking.openSettings()} />
                ) : null}
              </>
            )}
          </View>
        )}
      </View>
      {failure ? (
        <ErrorBanner
          message={addTicketMessage(failure, t)}
          retryLabel={t('scan.retry')}
          onRetry={retry}
        />
      ) : (
        <AppText variant="caption" weight="400" color={colors.text2} align="center">
          {t('scan.formats')}
        </AppText>
      )}
      <View style={styles.actions}>
        {live ? <Button label={t('scan.torch')} icon={Flashlight} variant="glass" onPress={() => setTorch(v => !v)} style={styles.flex} /> : null}
        <Button label={t('add.paste')} icon={ClipboardPaste} variant="glass" onPress={paste} style={styles.flex} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  camera: { flex: 1, minHeight: 280, borderRadius: radii.xl, overflow: 'hidden', backgroundColor: colors.camera, justifyContent: 'center', alignItems: 'center' },
  message: { alignItems: 'center', gap: spacing.md, padding: spacing.xl },
  frame: { position: 'absolute', left: '12%', right: '12%', top: '32%', bottom: '32%' },
  corner: { position: 'absolute', width: 36, height: 36, borderColor: colors.white },
  tl: { left: 0, top: 0, borderLeftWidth: 4, borderTopWidth: 4, borderTopLeftRadius: 14 },
  tr: { right: 0, top: 0, borderRightWidth: 4, borderTopWidth: 4, borderTopRightRadius: 14 },
  bl: { left: 0, bottom: 0, borderLeftWidth: 4, borderBottomWidth: 4, borderBottomLeftRadius: 14 },
  br: { right: 0, bottom: 0, borderRightWidth: 4, borderBottomWidth: 4, borderBottomRightRadius: 14 },
  scanline: { position: 'absolute', left: 8, right: 8, height: 3, borderRadius: 2, backgroundColor: colors.cameraGlow },
  pill: { position: 'absolute', top: spacing.lg, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: radii.pill, backgroundColor: colors.glassOnDark, borderWidth: 1, borderColor: colors.glassOnDarkBorder },
  live: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.success },
  flash: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.flash },
  actions: { flexDirection: 'row', gap: spacing.md },
});
