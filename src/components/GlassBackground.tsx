import { memo } from 'react';
import { StyleSheet } from 'react-native';
import Svg, { Defs, Ellipse, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg';
import { colors } from '../theme/tokens';

interface Props {
  /** „sky” = fundalul din modul avion: același cer, mai saturat */
  variant?: 'default' | 'sky';
}

// Norii: elipse albe difuze (centrul alb, marginile se topesc). Pozițiile sunt în % din ecran.
const CLOUDS: [cx: number, cy: number, rx: number, ry: number, o: number][] = [
  // Fâșii subțiri sus
  [18, 9, 34, 3.2, 0.55],
  [78, 15, 30, 2.6, 0.45],
  // Bancul de nori de la orizont
  [8, 58, 30, 6, 0.85],
  [34, 61, 26, 5, 0.75],
  [62, 57, 32, 6.5, 0.8],
  [92, 62, 26, 5.5, 0.85],
  [22, 70, 40, 7, 0.9],
  [70, 72, 44, 8, 0.9],
  // Nori jos, aproape de bara de tab-uri
  [10, 88, 36, 7, 0.75],
  [80, 92, 40, 8, 0.8],
];

// Fundalul „Sky & Dawn”: cer albastru sus, lavandă și piersică la orizont, soare care răsare în dreapta,
// și nori difuzi. E desenat o singură dată per ecran.
export const GlassBackground = memo(function GlassBackground({ variant = 'default' }: Props) {
  const sky = variant === 'sky';
  const id = (name: string) => `${variant}-${name}`;
  return (
    <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" pointerEvents="none">
      <Defs>
        <LinearGradient id={id('canvas')} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={sky ? colors.skyBg : colors.skyTop} />
          <Stop offset="0.3" stopColor={colors.skyMid} />
          <Stop offset="0.55" stopColor={colors.horizonLav} />
          <Stop offset="0.75" stopColor={colors.horizonPeach} />
          <Stop offset="1" stopColor={colors.cloudWhite} />
        </LinearGradient>
        <RadialGradient id={id('sun')} cx="86%" cy="60%" rx="70%" ry="30%">
          <Stop offset="0" stopColor={colors.sunCore} stopOpacity={0.9} />
          <Stop offset="0.35" stopColor={colors.sunGlow} stopOpacity={0.45} />
          <Stop offset="1" stopColor={colors.sunGlow} stopOpacity={0} />
        </RadialGradient>
        <RadialGradient id={id('blue')} cx="0%" cy="0%" rx="80%" ry="40%">
          <Stop offset="0" stopColor={sky ? colors.skyBlob1 : colors.blob1} stopOpacity={0.7} />
          <Stop offset="1" stopColor={colors.blob1} stopOpacity={0} />
        </RadialGradient>
        <RadialGradient id={id('violet')} cx="0%" cy="80%" rx="70%" ry="30%">
          <Stop offset="0" stopColor={sky ? colors.skyBlob2 : colors.blob2} stopOpacity={0.55} />
          <Stop offset="1" stopColor={colors.blob2} stopOpacity={0} />
        </RadialGradient>
        <RadialGradient id={id('cloud')}>
          <Stop offset="0" stopColor={colors.white} stopOpacity={1} />
          <Stop offset="0.55" stopColor={colors.white} stopOpacity={0.6} />
          <Stop offset="1" stopColor={colors.white} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Rect width="100%" height="100%" fill={`url(#${id('canvas')})`} />
      <Rect width="100%" height="100%" fill={`url(#${id('blue')})`} />
      <Rect width="100%" height="100%" fill={`url(#${id('violet')})`} />
      <Rect width="100%" height="100%" fill={`url(#${id('sun')})`} />
      {CLOUDS.map(([cx, cy, rx, ry, o], i) => (
        <Ellipse key={i} cx={`${cx}%`} cy={`${cy}%`} rx={`${rx}%`} ry={`${ry}%`} fill={`url(#${id('cloud')})`} opacity={o} />
      ))}
    </Svg>
  );
});

