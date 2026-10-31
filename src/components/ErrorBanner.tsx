import { CircleAlert, RotateCcw } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { colors, radii, spacing } from '../theme/tokens';
import { AppText } from './AppText';
import { Button } from './Button';

// Eroarea apare în blocul care a eșuat, mereu cu același aspect, și opțional cu „Reîncearcă”.
export function ErrorBanner({ message, retryLabel, onRetry }: { message: string; retryLabel?: string; onRetry?: () => void }) {
  return (
    <Animated.View entering={FadeIn.duration(200)} style={styles.banner} accessibilityRole="alert" accessibilityLiveRegion="polite">
      <View style={styles.row}>
        <CircleAlert size={18} color={colors.danger} strokeWidth={2} />
        <AppText variant="caption" weight="700" color={colors.danger} style={styles.text}>
          {message}
        </AppText>
      </View>
      {retryLabel && onRetry ? <Button label={retryLabel} icon={RotateCcw} variant="glass" size="sm" onPress={onRetry} /> : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: { gap: spacing.sm, padding: spacing.md, borderRadius: radii.lg, borderCurve: 'continuous', backgroundColor: colors.dangerSoft, borderWidth: 1, borderColor: colors.danger },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  text: { flex: 1 },
});
