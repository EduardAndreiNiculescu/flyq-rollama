import { Sparkles } from 'lucide-react-native';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInUp, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { colors, radii, spacing, chatGradient } from '../theme/tokens';
import { AppText } from './AppText';
import { Glass } from './Glass';
import { GradientFill } from './GradientFill';

interface Props {
  role: 'user' | 'assistant';
  text: string;
  author: string;
  streaming?: boolean;
  /** Ora mesajului, afișată mic sub text */
  time?: string;
}

// Bulele de chat: Flo în sticlă albă, cu avatarul alături; utilizatorul în gradientul „Arc” albastru → violet
export function ChatBubble({ role, text, author, streaming, time }: Props) {
  if (role === 'user') {
    return (
      <Animated.View entering={FadeInUp.duration(220)} style={[styles.bubble, styles.user]} accessible accessibilityLabel={`${author}: ${text}`}>
        <GradientFill colors={chatGradient} />
        <AppText variant="body" color={colors.onGradient} weight="700">
          {text}
        </AppText>
      </Animated.View>
    );
  }
  return (
    <Animated.View entering={FadeInUp.duration(220)} style={styles.aiRow} accessible accessibilityLabel={`${author}: ${text}`} accessibilityLiveRegion={streaming ? 'polite' : 'none'}>
      <FloAvatar size={34} />
      <Glass tone="strong" radius={radii.lg} style={[styles.bubble, styles.ai]}>
        <AppText variant="body">
          {text}
          {streaming && <Caret />}
        </AppText>
        {time ? (
          <AppText variant="caption" color={colors.textMuted} style={styles.time}>
            {time}
          </AppText>
        ) : null}
      </Glass>
    </Animated.View>
  );
}

/** Avatarul lui Flo: cerc cu gradient „Arc”, scânteie albă și, opțional, punctul verde „activ” */
export function FloAvatar({ size, live }: { size: number; live?: boolean }) {
  return (
    <View style={{ width: size, height: size }}>
      <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]}>
        <GradientFill colors={chatGradient} />
        <Sparkles size={size * 0.48} color={colors.onGradient} strokeWidth={2.2} />
      </View>
      {live ? <View style={[styles.liveDot, { width: size * 0.28, height: size * 0.28, borderRadius: size * 0.14 }]} /> : null}
    </View>
  );
}

function Caret() {
  const opacity = useSharedValue(1);
  // Cu „reducerea mișcării” activă, cursorul nu mai clipește
  const reduceMotion = useReducedMotion();
  useEffect(() => {
    if (!reduceMotion) opacity.value = withRepeat(withTiming(0, { duration: 500 }), -1, true);
  }, [opacity, reduceMotion]);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return (
    <Animated.View style={[styles.caretWrap, style]}>
      <View style={styles.caret} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  bubble: { maxWidth: '84%', paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  user: {
    alignSelf: 'flex-end',
    overflow: 'hidden',
    borderRadius: radii.lg,
    borderBottomRightRadius: 7,
    boxShadow: `0 6px 16px ${colors.shadowGlow}`,
  },
  aiRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm, alignSelf: 'flex-start', maxWidth: '92%' },
  ai: { flexShrink: 1, maxWidth: '100%', borderBottomLeftRadius: 7 },
  time: { marginTop: spacing.xs },
  avatar: { overflow: 'hidden', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.glassEdgeLit },
  liveDot: { position: 'absolute', right: 0, bottom: 0, backgroundColor: colors.successDot, borderWidth: 2, borderColor: colors.white },
  caretWrap: { width: 10, height: 16, paddingLeft: 2 },
  caret: { width: 8, height: 16, borderRadius: 2, backgroundColor: colors.accent },
});
