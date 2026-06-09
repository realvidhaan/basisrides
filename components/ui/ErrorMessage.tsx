import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

interface ErrorMessageProps {
  message: string | null;
}

export function ErrorMessage({ message }: ErrorMessageProps) {
  if (!message) return null;

  return (
    <View style={styles.container}>
      <Text style={styles.icon}>⚠️</Text>
      <Text style={styles.text}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#FFF1F1',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    gap: 8,
  },
  icon: {
    fontSize: 14,
    lineHeight: 20,
  },
  text: {
    flex: 1,
    fontSize: 14,
    color: '#DC143C',
    lineHeight: 20,
    fontWeight: '500',
  },
});
