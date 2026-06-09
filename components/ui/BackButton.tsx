import React from 'react';
import { StyleSheet, Text, TouchableOpacity } from 'react-native';

interface BackButtonProps {
  onPress: () => void;
}

export function BackButton({ onPress }: BackButtonProps) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={styles.button}
      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
      accessibilityRole="button"
      accessibilityLabel="Go back"
    >
      <Text style={styles.chevron}>‹</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 41,
    height: 41,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E8ECF4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chevron: {
    fontSize: 26,
    lineHeight: 30,
    color: '#1E232C',
    marginTop: -2,
  },
});
