import { StyleSheet, View } from 'react-native';
import Svg, { Defs, Ellipse, G, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg';
import { colors } from '../theme/tokens';

interface Props {
  width?: number;
  height?: number;
}

// Ilustrația din cardurile principale: cer în zori, nori și aripa unui avion văzută prin hublou.
// Stă în colțul din dreapta al cardului, în spatele textului, și se topește spre stânga;
// e mai înaltă decât cardul, iar cardul (overflow: hidden) o taie jos.
export function SkyArt({ width = 240, height = 240 }: Props) {
  return (
    <View pointerEvents="none" style={[styles.wrap, { width, height }]}>
      <Svg width={width} height={height} viewBox="0 0 240 240" preserveAspectRatio="xMaxYMin slice">
        <Defs>
          {/* Cerul se estompează spre stânga, ca textul cardului să rămână pe fond deschis */}
          <LinearGradient id="artSky" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor={colors.horizonLav} stopOpacity={0} />
            <Stop offset="0.45" stopColor={colors.horizonLav} stopOpacity={0.55} />
            <Stop offset="1" stopColor={colors.horizonPeach} stopOpacity={0.9} />
          </LinearGradient>
          <RadialGradient id="artSun" cx="85%" cy="70%" rx="45%" ry="40%">
            <Stop offset="0" stopColor={colors.sunCore} stopOpacity={0.95} />
            <Stop offset="1" stopColor={colors.sunGlow} stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id="artCloud">
            <Stop offset="0" stopColor={colors.white} stopOpacity={1} />
            <Stop offset="0.6" stopColor={colors.white} stopOpacity={0.7} />
            <Stop offset="1" stopColor={colors.white} stopOpacity={0} />
          </RadialGradient>
          <LinearGradient id="artWing" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={colors.wingLight} />
            <Stop offset="1" stopColor={colors.wingShade} />
          </LinearGradient>
          <LinearGradient id="artFade" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor={colors.white} stopOpacity={0} />
            <Stop offset="0.35" stopColor={colors.white} stopOpacity={1} />
          </LinearGradient>
        </Defs>
        <Rect width={240} height={240} fill="url(#artSky)" />
        <Rect width={240} height={240} fill="url(#artSun)" />
        {/* Nori sub aripă */}
        <Ellipse cx={175} cy={118} rx={80} ry={18} fill="url(#artCloud)" />
        <Ellipse cx={105} cy={128} rx={70} ry={14} fill="url(#artCloud)" opacity={0.8} />
        <Ellipse cx={228} cy={100} rx={40} ry={12} fill="url(#artCloud)" opacity={0.9} />
        {/* Aripa: intră din dreapta, se subțiază spre vârf, cu winglet-ul ridicat */}
        <G>
          <Path d="M240 30 C204 42 160 60 122 80 L118 86 C160 79 204 70 240 66 Z" fill="url(#artWing)" />
          <Path d="M240 30 C204 42 160 60 122 80" stroke={colors.white} strokeWidth={2} fill="none" opacity={0.9} />
          <Path d="M122 80 C116 68 112 54 113 42 L119 43 C119 55 122 68 128 78 Z" fill="url(#artWing)" />
          <Path d="M240 66 C204 70 160 79 118 86" stroke={colors.wingShade} strokeWidth={1} fill="none" />
        </G>
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', right: 0, top: 0 },
});
