import Svg, { Circle, Defs, G, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { colors } from '../theme/tokens';

// Logo-ul FlyQ, varianta „02 Avion” (design/logo/02-avion/svg), cu interiorul lentilei transparent.
// „mark” = semnul pătrat (lentila cu avionul), „wordmark” = textul FlyQ cu lentila.

const PLANE = 'M22 0C22-2 20-3 17-3H5L-6-18H-11L-4-3H-14L-18-9H-22L-19 0L-22 9H-18L-14 3H-4L-11 18H-6L5 3H17C20 3 22 2 22 0Z';
const LETTERS =
  'M28.35 140V46.41H51.94V140ZM46.99 105.05V85.15H93.39V105.05ZM46.99 66.31V46.41H95.44V66.31Z M101.13 140V43.77H124.16V140Z M151.93 140.16 125.96 75.45H150.55L166.45 128.68H156.78L172.76 75.45H197.28L170.81 140.16ZM136.62 167.39 155.69 125.28 170.81 140.16 159.66 167.39Z';

interface Props {
  variant?: 'mark' | 'wordmark';
  /** Înălțimea în pt; lățimea urmează proporțiile logo-ului */
  size?: number;
  accessibilityLabel?: string;
}

export function BrandLogo({ variant = 'mark', size = 36, accessibilityLabel = 'FlyQ' }: Props) {
  if (variant === 'wordmark') {
    return (
      <Svg width={(size * 336) / 157} height={size} viewBox="22 23 336 157" accessibilityLabel={accessibilityLabel} accessibilityRole="image">
        <Defs>
          <LinearGradient id="flow" gradientUnits="userSpaceOnUse" x1="20" y1="50" x2="350" y2="170">
            <Stop offset="0" stopColor={colors.brandInk} />
            <Stop offset="0.4" stopColor={colors.brandDeep} />
            <Stop offset="0.72" stopColor={colors.accent} />
            <Stop offset="1" stopColor={colors.brandSky} />
          </LinearGradient>
        </Defs>
        <Path d={LETTERS} fill="url(#flow)" />
        <Circle cx={270} cy={92} r={56} fill="none" stroke="url(#flow)" strokeWidth={14} />
        <Path d="M236 118C248 106 258 86 272 80" fill="none" stroke="url(#flow)" strokeWidth={3} strokeDasharray="2 7" strokeLinecap="round" />
        <Path d={PLANE} fill={colors.brandPlane} transform="translate(290 72) rotate(-22) scale(.9)" />
        <Path d="M310 132L344 166" stroke="url(#flow)" strokeWidth={15} strokeLinecap="round" />
      </Svg>
    );
  }
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100" accessibilityLabel={accessibilityLabel} accessibilityRole="image">
      <Defs>
        <LinearGradient id="sq" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={colors.brandLight} />
          <Stop offset="0.5" stopColor={colors.accent} />
          <Stop offset="1" stopColor={colors.brandDeep} />
        </LinearGradient>
      </Defs>
      <Rect width={100} height={100} rx={22} fill="url(#sq)" />
      <G>
        <Circle cx={46} cy={44} r={25} fill="none" stroke={colors.white} strokeWidth={7} />
        <Path d={PLANE} fill={colors.white} transform="translate(46 44) rotate(-20) scale(.62)" />
        <Path d="M65 63L79 77" stroke={colors.white} strokeWidth={8} strokeLinecap="round" />
      </G>
    </Svg>
  );
}
