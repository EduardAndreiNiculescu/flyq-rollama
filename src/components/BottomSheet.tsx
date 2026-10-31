import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { colors, spacing } from '../theme/tokens';
import { Glass } from './Glass';

// Panou de jos din sticlă, cu mâner. Pe tablete stă plutitor peste hartă (vezi MapView).
export function BottomSheet({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <Animated.View entering={FadeInDown.duration(300)} style={style}>
      <Glass tone="strong" floating radius={28} style={styles.sheet}>
        <View style={styles.grab} />
        {children}
      </Glass>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  sheet: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.lg },
  grab: { width: 38, height: 5, borderRadius: 3, backgroundColor: colors.line, alignSelf: 'center', marginBottom: spacing.md },
});
