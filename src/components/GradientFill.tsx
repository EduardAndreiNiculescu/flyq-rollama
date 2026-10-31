import { StyleSheet, View } from 'react-native';
import { ctaGradient } from '../theme/tokens';

interface Props {
  colors?: readonly string[];
  /** Direcția gradientului; implicit diagonal, de sus-stânga spre jos-dreapta */
  vertical?: boolean;
}

// Umple părintele cu un gradient (implicit „Arc”: albastru → indigo → violet).
// Gradient nativ (backgroundImage): fără SVG și fără măsurare cu onLayout, deci nicio re-randare la prima afișare.
export function GradientFill({ colors = ctaGradient, vertical }: Props) {
  const stops = colors.map((c, i) => `${c} ${Math.round((i / Math.max(1, colors.length - 1)) * 100)}%`).join(', ');
  return <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundImage: `linear-gradient(${vertical ? 'to bottom' : 'to bottom right'}, ${stops})` }]} />;
}
