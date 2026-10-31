import { StyleSheet, Text, type TextProps, type TextStyle } from 'react-native';
import { useLayout } from '../theme/responsive';
import { colors, type } from '../theme/tokens';

type Variant = keyof typeof type;

interface Props extends TextProps {
  variant?: Variant;
  color?: string;
  /** Doar două greutăți în toată aplicația: normal și bold */
  weight?: '400' | '700';
  align?: TextStyle['textAlign'];
  tabular?: boolean;
}

// Mărimea textului e fixă (1.0×), indiferent de setarea sistemului: scara de tipografie e
// gândită ca nimic să nu iasă din carduri, iar aplicația nu are control de mărire a textului.

export function AppText({ variant = 'body', color = colors.text, weight, align, tabular, style, ...rest }: Props) {
  const { type: scale } = useLayout();
  return (
    <Text
      allowFontScaling={false}
      style={[
        scale[variant] as TextStyle,
        { color },
        weight ? { fontWeight: weight } : null,
        align ? { textAlign: align } : null,
        tabular ? styles.tabular : null,
        style,
      ]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  tabular: { fontVariant: ['tabular-nums'] },
});
