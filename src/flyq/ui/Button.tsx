import * as React from 'react';
import { Pressable, StyleSheet, Text, type ViewStyle } from 'react-native';

import { colors } from './theme';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';

export interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: Variant;
  disabled?: boolean;
  compact?: boolean;
  active?: boolean;
  style?: ViewStyle;
  accessibilityHint?: string;
}

export function Button({
  label,
  onPress,
  variant = 'secondary',
  disabled = false,
  compact = false,
  active = false,
  style,
  accessibilityHint,
}: ButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled, selected: active }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [
        styles.base,
        compact ? styles.compact : styles.regular,
        variantStyles[variant],
        active && styles.active,
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
        style,
      ]}
    >
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        style={[
          styles.label,
          compact && styles.labelCompact,
          variant === 'ghost' && styles.labelGhost,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    borderRadius: 14,
    justifyContent: 'center',
  },
  regular: {
    minHeight: 52,
    paddingHorizontal: 18,
  },
  compact: {
    minHeight: 40,
    paddingHorizontal: 12,
  },
  active: {
    borderColor: colors.accentLight,
    borderWidth: 2,
  },
  disabled: {
    opacity: 0.4,
  },
  pressed: {
    opacity: 0.75,
    transform: [{ scale: 0.98 }],
  },
  label: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '700',
  },
  labelCompact: {
    fontSize: 14,
    fontWeight: '600',
  },
  labelGhost: {
    color: colors.accentLight,
  },
});

const variantStyles = StyleSheet.create({
  primary: {
    backgroundColor: colors.accent,
  },
  secondary: {
    backgroundColor: 'rgba(2, 132, 199, 0.10)',
  },
  danger: {
    backgroundColor: 'rgba(255, 85, 85, 0.9)',
  },
  ghost: {
    backgroundColor: 'transparent',
  },
});
