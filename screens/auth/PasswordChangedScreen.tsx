import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import type { StackNavigationProp } from '@react-navigation/stack';
import type { AuthStackParamList } from '@/types';
import { Button } from '@/components/ui/Button';
import { supabase } from '@/lib/supabase';
import { setRecovering } from '@/lib/authFlow';

type PasswordChangedNavigationProp = StackNavigationProp<
  AuthStackParamList,
  'PasswordChanged'
>;

interface Props {
  navigation: PasswordChangedNavigationProp;
}

export function PasswordChangedScreen({ navigation }: Props) {
  const [loading, setLoading] = useState(false);

  async function handleBackToLogin(): Promise<void> {
    setLoading(true);
    // End the temporary recovery session so the user logs in fresh with the
    // new password, then leave recovery mode.
    await supabase.auth.signOut();
    setRecovering(false);
    setLoading(false);
    navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />
      <View style={styles.inner}>
        <View style={styles.check}>
          <Text style={styles.checkMark}>✓</Text>
        </View>
        <Text style={styles.heading}>Password Changed!</Text>
        <Text style={styles.subtext}>
          Your password has been reset successfully.
        </Text>
        <View style={styles.buttonRow}>
          <Button
            title="Back to Login"
            onPress={handleBackToLogin}
            loading={loading}
          />
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
  check: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#16A34A',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 28,
  },
  checkMark: {
    color: '#FFFFFF',
    fontSize: 40,
    fontWeight: '700',
    lineHeight: 46,
  },
  heading: {
    fontSize: 30,
    fontWeight: '700',
    color: '#1E232C',
    letterSpacing: -0.3,
    textAlign: 'center',
    marginBottom: 12,
  },
  subtext: {
    fontSize: 15,
    fontWeight: '500',
    color: '#8391A1',
    textAlign: 'center',
    marginBottom: 36,
  },
  buttonRow: {
    width: '100%',
  },
});
