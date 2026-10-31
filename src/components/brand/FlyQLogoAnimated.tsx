import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedProps, useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import Svg, { Circle, Path } from 'react-native-svg';
import { colors } from '../../theme/tokens';
import type { LogoState } from './gsapBridge';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedPath = Animated.createAnimatedComponent(Path);

// Geometria semnului FlyQ „02 Avion” (design/logo/02-avion/svg/flyq-icon.svg), în cutia 0..100.
// Interiorul lentilei e transparent: prin el se vede ce e în spate (de ex. aplicația, la intrare).
const LENS = { cx: 46, cy: 44, r: 25 };
const RIM_LENGTH = 2 * Math.PI * LENS.r;
const TAIL_D = 'M65 63L79 77';
const TAIL_LENGTH = Math.hypot(14, 14);
const GLINT_D = 'M29.5 33.5A20 20 0 0 1 40 24.8';
const GLINT_LENGTH = 15;
const TRAIL_D = 'M4 92Q14 58 40 47';
const TRAIL_LENGTH = 60;
const PLANE_D = 'M22 0C22-2 20-3 17-3H5L-6-18H-11L-4-3H-14L-18-9H-22L-19 0L-22 9H-18L-14 3H-4L-11 18H-6L5 3H17C20 3 22 2 22 0Z';

interface Props<S extends LogoState> {
  state: SharedValue<S>;
  size: number;
  /** Culoarea ramei și a avionului; pe fundal închis se poate folosi alb */
  tint?: string;
}

export function FlyQLogoAnimated<S extends LogoState>({ state, size, tint = colors.accent }: Props<S>) {
  const k = size / 100;

  const rimProps = useAnimatedProps(() => ({ strokeDashoffset: (1 - state.value.rim) * RIM_LENGTH }));
  const tailProps = useAnimatedProps(() => ({ strokeDashoffset: (1 - state.value.tail) * TAIL_LENGTH }));
  const glintProps = useAnimatedProps(() => ({
    strokeDashoffset: (1 - state.value.glint) * GLINT_LENGTH * 2 - GLINT_LENGTH,
    opacity: Math.sin(Math.PI * state.value.glint),
  }));
  const trailProps = useAnimatedProps(() => ({
    strokeDashoffset: (1 - state.value.trail) * TRAIL_LENGTH,
    opacity: state.value.trailOpacity,
  }));
  const pulseProps = useAnimatedProps(() => ({
    r: LENS.r * (1 + 0.35 * state.value.pulse),
    opacity: state.value.pulse > 0 ? 0.4 * (1 - state.value.pulse) : 0,
  }));
  const planeStyle = useAnimatedStyle(() => ({
    opacity: state.value.planeOpacity,
    transform: [{ translateX: state.value.planeX * k }, { translateY: state.value.planeY * k }, { rotate: `${state.value.planeRot}deg` }],
  }));
  const orbitStyle = useAnimatedStyle(() => ({ opacity: state.value.orbitOpacity, transform: [{ rotate: `${state.value.orbit}deg` }] }));

  // Avionul și arcul orbital sunt View-uri separate, rotite/mutate prin transform (fluid, pe firul UI)
  const planeW = 30 * k;
  const planeH = 24 * k;
  const orbitBox = 80 * k;

  return (
    <View style={{ width: size, height: size }} accessibilityRole="image" accessibilityLabel="FlyQ">
      <Animated.View style={[styles.abs, { left: LENS.cx * k - orbitBox / 2, top: LENS.cy * k - orbitBox / 2, width: orbitBox, height: orbitBox }, orbitStyle]}>
        <Svg width="100%" height="100%" viewBox="0 0 80 80">
          <Path id="flyq-orbit" d="M40 6A34 34 0 0 1 74 40" fill="none" stroke={tint} strokeWidth={3} strokeLinecap="round" />
        </Svg>
      </Animated.View>
      <Svg width={size} height={size} viewBox="0 0 100 100" style={styles.abs}>
        <AnimatedCircle cx={LENS.cx} cy={LENS.cy} fill="none" stroke={tint} strokeWidth={2} animatedProps={pulseProps} />
        <AnimatedPath id="flyq-trail" d={TRAIL_D} fill="none" stroke={tint} strokeWidth={2.4} strokeLinecap="round" strokeDasharray={`${TRAIL_LENGTH} ${TRAIL_LENGTH}`} animatedProps={trailProps} />
        <AnimatedCircle
          id="flyq-lens-rim"
          cx={LENS.cx}
          cy={LENS.cy}
          r={LENS.r}
          fill="none"
          stroke={tint}
          strokeWidth={7}
          strokeLinecap="round"
          strokeDasharray={`${RIM_LENGTH} ${RIM_LENGTH}`}
          // Desenul pornește de sus (-90°), în sensul acelor de ceasornic
          transform={`rotate(-90 ${LENS.cx} ${LENS.cy})`}
          animatedProps={rimProps}
        />
        <AnimatedPath id="flyq-lens-tail" d={TAIL_D} stroke={tint} strokeWidth={8} strokeLinecap="round" strokeDasharray={`${TAIL_LENGTH} ${TAIL_LENGTH}`} animatedProps={tailProps} />
        <AnimatedPath id="flyq-lens-glint" d={GLINT_D} fill="none" stroke={colors.white} strokeWidth={2.6} strokeLinecap="round" strokeDasharray={`${GLINT_LENGTH} ${GLINT_LENGTH}`} animatedProps={glintProps} />
      </Svg>
      <Animated.View style={[styles.abs, { left: LENS.cx * k - planeW / 2, top: LENS.cy * k - planeH / 2, width: planeW, height: planeH }, planeStyle]}>
        <Svg width="100%" height="100%" viewBox="-15 -12 30 24">
          <Path id="flyq-airplane" d={PLANE_D} fill={tint} transform="scale(.62)" />
        </Svg>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  abs: { position: 'absolute', left: 0, top: 0 },
});
