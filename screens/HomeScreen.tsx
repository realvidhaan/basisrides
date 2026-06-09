import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Button } from '@/components/ui/Button';
import { supabase } from '@/lib/supabase';

export function HomeScreen() {
  const [loading, setLoading] = useState(false);

  async function handleLogout(): Promise<void> {
    setLoading(true);
    await supabase.auth.signOut();
    setLoading(false);
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />
      <View style={styles.inner}>
        <Text style={styles.wordmark}>BasisRide</Text>
        <Text style={styles.subtitle}>Schedule coming in Day 2</Text>
        <View style={styles.logoutRow}>
          <Button title="Log out" onPress={handleLogout} loading={loading} />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  inner: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  wordmark: {
    fontSize: 36,
    fontWeight: '700',
    color: '#DC143C',
    marginBottom: 12,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 15,
    color: '#6B6B6B',
    marginBottom: 48,
  },
  logoutRow: {
    width: '100%',
  },
});
