import { useGSAP } from '@gsap/react';
import { gsap } from 'gsap';
import { useRef } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, type SharedValue } from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { useT } from '../../i18n';
import { colors, spacing, type } from '../../theme/tokens';
import { FlyQLogoAnimated } from './FlyQLogoAnimated';
import { LOGO_AT_REST, useGsapState, type LogoState } from './gsapBridge';

// Lupa are mărimea unei litere: când aterizează după „Fly”, ea devine „Q”-ul din „FlyQ”
const FONT_SIZE = 56;
const LINE_HEIGHT = 66;
const LOGO_SIZE = 72;
const K = LOGO_SIZE / 100;
// Locul „Q”-ului din rând: cât de lată e vizual lupa (rama + coada)
const SLOT_W = 47;
// Centrul lentilei (46, 44 din cutia logo-ului) cade pe centrul locului și puțin sub mijlocul rândului
const LENS_LEFT = SLOT_W / 2 - 46 * K;
const LENS_TOP = LINE_HEIGHT / 2 + 3 - 44 * K;
// De unde pornește lupa: puțin în stânga primei litere
const START_GAP = SLOT_W * 1.3;
// Raza în care lupa mărește litera de sub ea
const MAG_R = 38;

interface SplashState extends LogoState {
  /** 0 → 1: lupa apare cu un mic arc elastic */
  lensIn: number;
  /** 0 → 1: lupa se plimbă de dinaintea lui „F” până în locul „Q”-ului */
  glide: number;
  /** 0 → 1: mica săltare la aterizare */
  land: number;
  /** 0 → numărul de litere din „Fly” */
  letters: number;
  /** 0 → numărul de cuvinte din subtitlu */
  words: number;
  /** 1 → 0: la final, tot ecranul de pornire se estompează */
  fade: number;
}

const START: SplashState = {
  ...LOGO_AT_REST,
  rim: 0,
  tail: 0,
  planeX: -34,
  planeY: 30,
  planeRot: -55,
  planeOpacity: 0,
  lensIn: 0,
  glide: 0,
  land: 0,
  letters: 0,
  words: 0,
  fade: 1,
};

/** Centrele literelor și al locului „Q”, măsurate în rând (ultimul element e locul lupei) */
type Centers = SharedValue<number[]>;

/**
 * Animația de pornire (~2,8 s): apare „Fly”, lupa FlyQ se plimbă peste litere și le mărește,
 * aterizează la final ca „Q”, avionul intră în lentilă, apoi ecranul se estompează lin în aplicație.
 */
export function FlyQSplashIntro({ onDone }: { onDone: () => void }) {
  const t = useT();
  const reduceMotion = useReducedMotion();
  const { proxy, state, sync } = useGsapState<SplashState>(START);
  const letters = t('app.brand').replace(/Q$/, '').split('');
  const subtitleWords = t('splash.subtitle').split(' ');

  const centersRef = useRef<number[]>(new Array(letters.length + 1).fill(0));
  const centers = useSharedValue<number[]>(centersRef.current.slice());
  const measure = (i: number) => (e: LayoutChangeEvent) => {
    centersRef.current[i] = e.nativeEvent.layout.x + e.nativeEvent.layout.width / 2;
    centers.value = centersRef.current.slice();
  };

  useGSAP(() => {
    if (reduceMotion) {
      // Fără mișcare amplă: „FlyQ” apare întreg și ecranul se estompează în 300 ms
      Object.assign(proxy, LOGO_AT_REST, { lensIn: 1, glide: 1, letters: letters.length, words: subtitleWords.length });
      sync();
      gsap.to(proxy, { fade: 0, duration: 0.3, delay: 0.6, onUpdate: sync, onComplete: onDone });
      return;
    }
    const tl = gsap.timeline({ onUpdate: sync, onComplete: onDone });
    // Faza 1: literele „Fly” urcă pe rând, iar lupa se desenează în stânga lor
    tl.to(proxy, { letters: letters.length, duration: 0.45, ease: 'power1.out' }, 0.05)
      .to(proxy, { lensIn: 1, duration: 0.55, ease: 'back.out(1.7)' }, 0)
      .to(proxy, { rim: 1, duration: 0.5, ease: 'power3.inOut' }, 0)
      .to(proxy, { tail: 1, duration: 0.3, ease: 'power3.inOut' }, 0.25)
      // Faza 2: lupa alunecă lin peste litere (le mărește pe rând) și se oprește în locul „Q”-ului
      .to(proxy, { glide: 1, duration: 1.3, ease: 'sine.inOut' }, 0.4)
      .to(proxy, { land: 1, duration: 0.4, ease: 'power1.out' }, 1.62)
      // Avionul intră în lentilă, cu dâră, iar reflexul trece pe ramă
      .to(proxy, { planeOpacity: 1, duration: 0.15, ease: 'none' }, 1.68)
      .to(proxy, { planeX: 0, planeY: 0, duration: 0.5, ease: 'power3.out' }, 1.68)
      .to(proxy, { planeRot: -20, duration: 0.5, ease: 'back.out(1.6)' }, 1.68)
      .to(proxy, { trail: 1, trailOpacity: 1, duration: 0.35, ease: 'power2.out' }, 1.7)
      .to(proxy, { trailOpacity: 0, duration: 0.3, ease: 'power1.in' }, 2.0)
      .to(proxy, { glint: 1, duration: 0.45, ease: 'sine.inOut' }, 1.95)
      .to(proxy, { words: subtitleWords.length, duration: 0.04 * subtitleWords.length + 0.35, ease: 'none' }, 1.75)
      // Faza 3: tot ecranul de pornire se estompează lin și lasă aplicația dedesubt
      .to(proxy, { fade: 0, duration: 0.5, ease: 'power2.inOut' }, 2.45);
  }, []);

  const fadeStyle = useAnimatedStyle(() => ({ opacity: state.value.fade }));
  // Lupa pleacă din stânga lui „F” și ajunge în locul ei; pe drum se legănă ușor, o dată pe literă
  const lensStyle = useAnimatedStyle(() => {
    const s = state.value;
    const c = centers.value;
    const slot = c[c.length - 1] ?? 0;
    const startOffset = slot ? (c[0] ?? 0) - slot - START_GAP : 0;
    const n = c.length - 1;
    const bump = 1 + 0.12 * Math.sin(Math.PI * s.land);
    // Cât se plimbă, lupa e puțin mai mare (lupă de citit); la aterizare se strânge la mărimea unei litere
    const settle = Math.min(1, Math.max(0, (s.glide - 0.8) / 0.2));
    const reading = 1 + 0.22 * (1 - settle * settle * (3 - 2 * settle));
    return {
      opacity: Math.min(1, s.lensIn * 2),
      transform: [
        { translateX: (1 - s.glide) * startOffset },
        { translateY: -Math.sin(s.glide * Math.PI * n) * 4 },
        { rotate: `${Math.sin(s.glide * Math.PI * 2) * -9}deg` },
        { scale: (0.6 + 0.4 * s.lensIn) * reading * bump },
      ],
    };
  });

  return (
    <Animated.View style={[StyleSheet.absoluteFill, fadeStyle]} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={StyleSheet.absoluteFill}>
        <Svg width="100%" height="100%">
          <Defs>
            <LinearGradient id="splash" x1="0" y1="0" x2="0.4" y2="1">
              <Stop offset="0" stopColor={colors.splashTop} />
              <Stop offset="0.55" stopColor={colors.splashMid} />
              <Stop offset="1" stopColor={colors.white} />
            </LinearGradient>
          </Defs>
          <Rect width="100%" height="100%" fill="url(#splash)" />
        </Svg>
      </View>
      <View style={styles.center}>
        <View style={styles.row}>
          {letters.map((ch, i) => (
            <Letter key={`${ch}-${i}`} state={state} centers={centers} index={i} text={ch} onLayout={measure(i)} />
          ))}
          {/* Lupa stă deasupra literelor: prin interiorul ei transparent se vede litera mărită */}
          <View style={styles.slot} onLayout={measure(letters.length)}>
            <Animated.View style={[styles.lens, lensStyle]}>
              <FlyQLogoAnimated state={state} size={LOGO_SIZE} />
            </Animated.View>
          </View>
        </View>
        <View style={styles.subtitle}>
          {subtitleWords.map((w, i) => (
            <Word key={`${w}-${i}`} state={state} index={i} text={w} />
          ))}
        </View>
      </View>
    </Animated.View>
  );
}

// Litera urcă și apare, apoi se mărește lin când lupa trece pe deasupra ei
function Letter({
  state,
  centers,
  index,
  text,
  onLayout,
}: {
  state: SharedValue<SplashState>;
  centers: Centers;
  index: number;
  text: string;
  onLayout: (e: LayoutChangeEvent) => void;
}) {
  const style = useAnimatedStyle(() => {
    const s = state.value;
    const c = centers.value;
    const slot = c[c.length - 1] ?? 0;
    const p = Math.min(1, Math.max(0, s.letters - index));
    let mag = 0;
    if (slot) {
      const lensX = slot + (1 - s.glide) * ((c[0] ?? 0) - slot - START_GAP);
      const m = Math.max(0, 1 - Math.abs(lensX - (c[index] ?? 0)) / MAG_R);
      mag = m * m * (3 - 2 * m);
    }
    return {
      opacity: p,
      transform: [{ translateY: (1 - p) * 12 - mag * 2 }, { scale: 1 + 0.42 * mag }],
    };
  });
  return (
    <Animated.Text allowFontScaling={false} onLayout={onLayout} style={[styles.letter, style]}>
      {text}
    </Animated.Text>
  );
}

// Fiecare cuvânt din subtitlu urcă 14 pt și apare, decalat de cel dinainte
function Word({ state, index, text }: { state: SharedValue<SplashState>; index: number; text: string }) {
  const style = useAnimatedStyle(() => {
    const p = Math.min(1, Math.max(0, state.value.words - index));
    return { opacity: p, transform: [{ translateY: (1 - p) * 14 }] };
  });
  return (
    <Animated.Text allowFontScaling={false} style={[styles.word, style]}>
      {text}
    </Animated.Text>
  );
}

const styles = StyleSheet.create({
  center: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', height: LINE_HEIGHT },
  letter: { ...type.display, fontSize: FONT_SIZE, lineHeight: LINE_HEIGHT, color: colors.text },
  slot: { width: SLOT_W, height: LINE_HEIGHT, marginLeft: 2 },
  // Scalarea și rotirea au originea în centrul lentilei (46%, 44% din logo)
  lens: { position: 'absolute', left: LENS_LEFT, top: LENS_TOP, transformOrigin: '46% 44%' },
  subtitle: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 5, paddingHorizontal: spacing.xl, marginTop: spacing.md },
  word: { ...type.body, color: colors.text2 },
});
