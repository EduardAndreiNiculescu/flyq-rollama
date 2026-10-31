import { useGSAP } from '@gsap/react';
import { gsap } from 'gsap';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut, useReducedMotion } from 'react-native-reanimated';
import { colors, radii, spacing } from '../../theme/tokens';
import { AppText } from '../AppText';
import { Glass } from '../Glass';
import { GlassBackground } from '../GlassBackground';
import { FlyQLogoAnimated } from './FlyQLogoAnimated';
import { LOGO_AT_REST, useGsapState, type LogoState } from './gsapBridge';

interface Props {
  /** overlay = card de sticlă peste ecran; inline = într-un rând; panel = acoperă containerul (de ex. harta); bare = doar logoul, fără card, peste ce e dedesubt (de ex. cerul globului); fullscreen = toată pagina */
  variant: 'overlay' | 'inline' | 'panel' | 'bare' | 'fullscreen';
  message?: string;
  /** Fără text pe ecran: doar pentru cititoarele de ecran (de ex. pe hărți, unde se vede doar logoul animat) */
  label?: string;
}

const SIZES = { overlay: 72, inline: 52, panel: 112, bare: 112, fullscreen: 104 } as const;

/** Loader-ul FlyQ: inel de radar din ramă, avionul plutește în lentilă, un arc orbitează în jur. */
export function FlyQLoader({ variant, message, label }: Props) {
  const reduceMotion = useReducedMotion();
  const { proxy, state, sync } = useGsapState<LogoState>({ ...LOGO_AT_REST, orbitOpacity: 1 });

  useGSAP(() => {
    if (reduceMotion) return;
    const opts = { onUpdate: sync, repeat: -1 };
    gsap.to(proxy, { pulse: 1, duration: 1.4, ease: 'power1.out', ...opts });
    gsap.to(proxy, { planeY: 3, duration: 0.9, ease: 'sine.inOut', yoyo: true, ...opts, startAt: { planeY: -3 } });
    gsap.to(proxy, { planeRot: -18, duration: 1.1, ease: 'sine.inOut', yoyo: true, ...opts, startAt: { planeRot: -22 } });
    gsap.to(proxy, { orbit: 360, duration: 1.6, ease: 'none', ...opts });
  }, [reduceMotion]);

  const content = (
    <View style={[styles.content, variant === 'inline' && styles.inlineContent]}>
      <FlyQLogoAnimated state={state} size={SIZES[variant]} />
      {message ? (
        <AppText variant={variant === 'fullscreen' ? 'headline' : 'caption'} color={colors.text2} align={variant === 'inline' ? undefined : 'center'} style={variant === 'inline' ? styles.inlineText : undefined}>
          {message}
        </AppText>
      ) : null}
    </View>
  );

  const a11y = { accessible: true, accessibilityRole: 'progressbar' as const, accessibilityLabel: message ?? label, accessibilityLiveRegion: 'polite' as const };

  if (variant === 'inline') return <View {...a11y}>{content}</View>;

  // panel: un card de sticlă care acoperă containerul și se estompează lin când conținutul e gata
  if (variant === 'panel') {
    return (
      <Animated.View entering={FadeIn.duration(150)} exiting={FadeOut.duration(350)} style={[StyleSheet.absoluteFill, styles.panel]} {...a11y}>
        <Glass tone="strong" style={[styles.center, styles.panelCard]}>
          {content}
        </Glass>
      </Animated.View>
    );
  }

  if (variant === 'bare') {
    return (
      <Animated.View entering={FadeIn.duration(250)} exiting={FadeOut.duration(450)} pointerEvents="none" style={[StyleSheet.absoluteFill, styles.center]} {...a11y}>
        {content}
      </Animated.View>
    );
  }

  if (variant === 'fullscreen') {
    return (
      <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(200)} style={StyleSheet.absoluteFill} {...a11y}>
        <GlassBackground />
        <View style={styles.center}>{content}</View>
      </Animated.View>
    );
  }

  // overlay: card de sticlă peste ecranul curent, pentru tranziții scurte (300–900 ms)
  return (
    <Animated.View entering={FadeIn.duration(150)} exiting={FadeOut.duration(150)} style={[StyleSheet.absoluteFill, styles.scrim]} {...a11y}>
      <View style={styles.center}>
        <Glass tone="strong" floating radius={radii.xl} style={styles.card}>
          {content}
        </Glass>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  panel: { zIndex: 5 },
  // Opac, ca placeholder-ul / harta care se încarcă dedesubt să nu se vadă prin el
  panelCard: { backgroundColor: colors.surfaceOpaque },
  scrim: { backgroundColor: colors.scrim, zIndex: 10 },
  card: { paddingHorizontal: spacing.xl, paddingVertical: spacing.lg, minWidth: 200, maxWidth: 300 },
  content: { alignItems: 'center', gap: spacing.md },
  inlineContent: { flexDirection: 'row', justifyContent: 'center', paddingVertical: spacing.md },
  inlineText: { flexShrink: 1 },
});
