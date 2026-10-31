import { useEffect, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Platform, StyleSheet, View, type StyleProp, type ViewProps, type ViewStyle } from 'react-native';
import { useSettings } from '../store/settings';
import { colors, radii } from '../theme/tokens';

export type GlassLevel = 'glass' | 'strong' | 'opaque';

interface Props extends ViewProps {
  children?: ReactNode;
  /** „strong” pentru suprafețe cu mult text (boarding pass, sheet, bule de chat) */
  tone?: 'normal' | 'strong';
  radius?: number;
  style?: StyleProp<ViewStyle>;
  /** Umbră mai pronunțată, pentru elemente care plutesc (tab bar, sheet) */
  floating?: boolean;
}

/** Nivelul de sticlă: opac când utilizatorul cere transparență redusă (din aplicație sau din iOS). */
export function useGlassLevel(): GlassLevel {
  const reduce = useSettings(state => state.reduceTransparency);
  const [systemReduce, setSystemReduce] = useState(false);
  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    AccessibilityInfo.isReduceTransparencyEnabled().then(setSystemReduce);
    const sub = AccessibilityInfo.addEventListener('reduceTransparencyChanged', setSystemReduce);
    return () => sub.remove();
  }, []);
  return reduce || systemReduce ? 'opaque' : 'glass';
}

// Sticlă „frosted”: alb translucid + contur specular (luminos sus-stânga, stins jos-dreapta) + reflex sus
// + umbră colorată albastră. Blur-ul real nu e folosit
// (biblioteca de blur nu e compatibilă cu RN 0.88), dar petele din fundal se văd prin suprafață.
export function Glass({ children, tone = 'normal', radius = radii.xl, style, floating, ...rest }: Props) {
  const level = useGlassLevel();
  const background =
    level === 'opaque' ? colors.surfaceOpaque : tone === 'strong' ? colors.glassStrong : colors.glassFrosted;
  return (
    <View
      style={[
        styles.base,
        { borderRadius: radius, backgroundColor: background },
        level === 'opaque' && styles.opaqueBorder,
        floating ? styles.floating : styles.resting,
        style,
      ]}
      {...rest}
    >
      {level !== 'opaque' && (
        // Reflexul de sus se estompează treptat, ca să nu apară o linie la jumătatea cardului.
        // Gradient nativ (fără SVG): un card nu mai costă un Svg în plus
        <View pointerEvents="none" style={[styles.sheen, { borderTopLeftRadius: radius, borderTopRightRadius: radius }]} />
      )}
      {/* Linia de luciu de 1 px din interiorul marginii de sus */}
      {level !== 'opaque' && <View pointerEvents="none" style={styles.gloss} />}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    borderWidth: 1.5,
    borderTopColor: colors.glassEdgeLit,
    borderLeftColor: colors.glassEdgeLit,
    borderBottomColor: colors.glassEdgeShade,
    borderRightColor: colors.glassEdgeShade,
    // Colțuri continue (squircle) pe iOS; boxShadow nu e tăiat de overflow, deci putem tăia conținutul
    borderCurve: 'continuous',
    overflow: 'hidden',
  },
  opaqueBorder: { borderColor: colors.opaqueBorder },
  gloss: { position: 'absolute', top: 0, left: 14, right: 14, height: 1, backgroundColor: colors.glassEdgeLit },
  sheen: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: 56,
    overflow: 'hidden',
    backgroundImage: `linear-gradient(to bottom, rgba(255,255,255,0.45), rgba(255,255,255,0))`,
  },
  // Cardurile au o umbră albastră difuză; elementele care plutesc (tab bar, sheet, banda cu biletul) una mai adâncă
  // Două straturi: umbra largă colorată (adâncime) și una scurtă neutră (contact cu suprafața), ca la materialele Apple
  resting: { boxShadow: `0 10px 26px -4px ${colors.shadowCard}, 0 2px 8px -2px rgba(0,0,0,0.05)` },
  floating: { boxShadow: `0 14px 32px -4px ${colors.shadowFloat}, 0 4px 12px -2px rgba(0,0,0,0.06)` },
});
