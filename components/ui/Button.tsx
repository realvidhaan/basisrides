import React from 'react';
import { colors } from '@/constants/theme/colors';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  type GestureResponderEvent,
} from 'react-native';

type ButtonVariant = 'primary' | 'outline';

interface ButtonProps {
  title: string;
  onPress: (event: GestureResponderEvent) => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: ButtonVariant;
}

export function Button({
  title,
  onPress,
  loading = false,
  disabled = false,
  variant = 'primary',
}: ButtonProps) {
  const isDisabled = disabled || loading;
  const isOutline = variant === 'outline';

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={isDisabled}
      activeOpacity={0.85}
      // TouchableOpacity has no implicit role, so without these VoiceOver
      // announces every button in the app as plain text. `busy` is what tells a
      // screen reader the tap registered while the spinner is up.
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      style={[
        styles.button,
        isOutline ? styles.buttonOutline : styles.buttonPrimary,
        isDisabled && styles.buttonDisabled,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={isOutline ? colors.ink : colors.surfaceWhite} size="small" />
      ) : (
        <Text style={[styles.label, isOutline ? styles.labelOutline : styles.labelPrimary]}>
          {title}
        </Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    width: '100%',
    height: 52,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonPrimary: {
    backgroundColor: colors.brandTeal,
  },
  buttonOutline: {
    backgroundColor: colors.surfaceWhite,
    borderWidth: 1.5,
    borderColor: colors.ink,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  label: {
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  labelPrimary: {
    color: colors.surfaceWhite,
  },
  labelOutline: {
    color: colors.ink,
  },
});
