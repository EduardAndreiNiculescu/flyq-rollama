import { useNavigation } from '@react-navigation/native';
import { CircleCheck, ClipboardPaste, Flashlight } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, FadeIn, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { AppText } from '../components/AppText';
import { Button } from '../components/Button';
import { Screen, ScreenHeader } from '../components/Layout';
import { useT } from '../i18n';
import { barcodeScanner } from '../services';
import { useAddTicket } from '../store/addTicket';
import { colors, radii, spacing } from '../theme/tokens';

// Cameră simulată: un bilet tipărit în cadru și o linie de scanare animată.
// Când va exista o cameră reală, se schimbă doar BarcodeScannerService.
export function ScanScreen() {
  const t = useT();
  const navigation = useNavigation();
  const addTicket = useAddTicket();
  const [found, setFound] = useState(false);
  const [torch, setTorch] = useState(false);
  const line = useSharedValue(0.5);
  const frameHeight = useSharedValue(0);
  // Cu „reducerea mișcării” activă, linia de scanare stă pe loc la mijlocul cadrului
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (!reduceMotion) {
      line.value = 0;
      line.value = withRepeat(withTiming(1, { duration: 1300, easing: Easing.inOut(Easing.quad) }), -1, true);
    }
    let active = true;
    barcodeScanner
      .scan()
      .then(code => {
        if (!active) return;
        setFound(true);
        setTimeout(() => active && addTicket(code, true), 700);
      })
      .catch(() => undefined);
    return () => {
      active = false;
      barcodeScanner.cancel();
    };
  }, [addTicket, line, reduceMotion]);

  // Animăm transform (translateY), nu poziția `top`: fluid și pe telefoane vechi
  const lineStyle = useAnimatedStyle(() => ({ transform: [{ translateY: frameHeight.value * (0.08 + line.value * 0.84) }] }));

  return (
    <Screen bottomInset="safeArea" column="columnNarrow">
      <ScreenHeader title={t('scan.title')} titleSize="headline" onBack={() => navigation.goBack()} />
      <View style={[styles.camera, torch && styles.cameraTorch]} accessible accessibilityLabel={t('scan.simulated')}>
        <View style={styles.paper}>
          <View style={[styles.paperLine, { width: '55%' }]} />
          <View style={[styles.paperLine, { width: '80%' }]} />
          <View style={[styles.paperLine, { width: '40%' }]} />
          <View style={styles.barcode}>
            {BARS.map((w, i) => (
              <View key={i} style={[styles.bar, { width: w }]} />
            ))}
          </View>
          <View style={[styles.paperLine, { width: '65%', marginTop: spacing.md }]} />
        </View>
        <View style={styles.frame} onLayout={e => (frameHeight.value = e.nativeEvent.layout.height)}>
          <View style={[styles.corner, styles.tl]} />
          <View style={[styles.corner, styles.tr]} />
          <View style={[styles.corner, styles.bl]} />
          <View style={[styles.corner, styles.br]} />
          {found ? null : <Animated.View style={[styles.scanline, lineStyle]} />}
        </View>
        <View style={styles.pill}>
          {found ? <CircleCheck size={16} color={colors.white} /> : <View style={styles.live} />}
          <AppText variant="caption" color={colors.white}>
            {found ? t('scan.found') : t('scan.hint')}
          </AppText>
        </View>
        {found ? <Animated.View entering={FadeIn} style={styles.flash} /> : null}
      </View>
      <AppText variant="caption" weight="400" color={colors.text2} align="center">
        {t('scan.formats')}
      </AppText>
      <View style={styles.actions}>
        <Button label={t('scan.torch')} icon={Flashlight} variant="glass" onPress={() => setTorch(v => !v)} style={styles.flex} />
        <Button label={t('add.paste')} icon={ClipboardPaste} variant="glass" onPress={() => navigation.navigate('Paste')} style={styles.flex} />
      </View>
    </Screen>
  );
}

// Lățimile barelor unui PDF417 stilizat
const BARS = [3, 1, 2, 4, 1, 1, 3, 2, 1, 4, 2, 1, 1, 3, 1, 2, 2, 4, 1, 3, 1, 1, 2, 3, 4, 1, 2, 1, 3, 2, 1, 4, 1, 2, 3, 1, 1, 2, 4, 2, 1, 3];

const styles = StyleSheet.create({
  flex: { flex: 1 },
  camera: { flex: 1, minHeight: 280, borderRadius: radii.xl, overflow: 'hidden', backgroundColor: colors.camera, justifyContent: 'center', alignItems: 'center' },
  cameraTorch: { backgroundColor: colors.cameraTorch },
  paper: { width: '78%', padding: spacing.lg, borderRadius: 6, backgroundColor: colors.paper, transform: [{ rotate: '-8deg' }] },
  paperLine: { height: 8, borderRadius: 3, backgroundColor: colors.paperInk, marginBottom: spacing.sm },
  barcode: { flexDirection: 'row', height: 56, gap: 1.5, marginTop: spacing.md, overflow: 'hidden' },
  bar: { backgroundColor: colors.barcodeInk },
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
