import type { ReactNode } from 'react';
import { Pressable, type PressableProps, type PressableStateCallbackType, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring } from 'react-native-reanimated';
import { motion } from '../theme/tokens';

// Un singur loc pentru feedback-ul la apăsare: tot ce se apasă în aplicație se micșorează ușor cu un „spring”
// (scale 0,97, opacitate 0,9) și revine elastic. Rulează doar pe UI thread. Cu mișcare redusă rămâne doar opacitatea.
export const PRESSED_OPACITY = 0.85;

/** Varianta veche, doar opacitate: păstrată pentru paginile colegilor (Hartă, Asistent), care o folosesc deja */
export function pressFeedback(base?: StyleProp<ViewStyle>) {
  return ({ pressed }: PressableStateCallbackType): StyleProp<ViewStyle> => [base, pressed ? { opacity: PRESSED_OPACITY } : null];
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface Props extends Omit<PressableProps, 'style' | 'children'> {
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
  /** Cât se micșorează la apăsare (implicit 0,97; tab-urile și chip-urile mici pot merge mai jos) */
  scaleTo?: number;
}

export function PressableScale({ style, scaleTo = 0.97, onPressIn, onPressOut, children, ...rest }: Props) {
  const reduceMotion = useReducedMotion();
  const pressed = useSharedValue(0);
  const shrink = reduceMotion ? 0 : 1 - scaleTo;
  const animated = useAnimatedStyle(() => ({
    opacity: 1 - 0.1 * pressed.value,
    transform: [{ scale: 1 - shrink * pressed.value }],
  }));
  return (
    <AnimatedPressable
      {...rest}
      onPressIn={e => {
        pressed.value = withSpring(1, motion.pressIn);
        onPressIn?.(e);
      }}
      onPressOut={e => {
        pressed.value = withSpring(0, motion.pressOut);
        onPressOut?.(e);
      }}
      style={[style, animated]}
    >
      {children}
    </AnimatedPressable>
  );
}
