import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import type { StackNavigationProp } from '@react-navigation/stack';
import * as Sentry from '@sentry/react-native';
import type { AuthStackParamList } from '@/types';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { ErrorMessage } from '@/components/ui/ErrorMessage';
import { BackButton } from '@/components/ui/BackButton';
import { FormScroll, webScreenFix } from '@/components/ui/FormScroll';
import { supabase, mapSupabaseError } from '@/lib/supabase';

type ForgotPasswordNavigationProp = StackNavigationProp<
  AuthStackParamList,
  'ForgotPassword'
>;

interface Props {
  navigation: ForgotPasswordNavigationProp;
}

export function ForgotPasswordScreen({ navigation }: Props) {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSendCode(): Promise<void> {
    setError(null);
    setLoading(true);

    const trimmed = email.trim();

    // Confirm an account actually exists before sending a reset code. Supabase's
    // resetPasswordForEmail silently succeeds for unknown emails (anti-enumeration),
    // which would otherwise send users to the code screen for an account that
    // doesn't exist. A SECURITY DEFINER RPC checks auth.users safely.
    const { data: exists, error: lookupError } = await supabase.rpc(
      'email_exists',
      { p_email: trimmed },
    );

    if (lookupError) {
      Sentry.captureException(lookupError);
      setLoading(false);
      setError(mapSupabaseError(lookupError));
      return;
    }

    if (!exists) {
      setLoading(false);
      setError('No account found with this email.');
      return;
    }

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(
      trimmed,
    );

    setLoading(false);

    if (resetError) {
      Sentry.captureException(resetError);
      setError(mapSupabaseError(resetError));
      return;
    }

    navigation.navigate('OTPVerification', { email: trimmed, flow: 'reset' });
  }

  return (
    <SafeAreaView style={[styles.container, webScreenFix]} edges={['top']}>
      <StatusBar style="dark" />

      <View style={styles.backRow}>
        <BackButton onPress={() => navigation.goBack()} />
      </View>

      <FormScroll style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <Text style={styles.heading}>Forgot Password?</Text>
        <Text style={styles.subtext}>
          Don&apos;t worry! Please enter the email address linked with your
          account.
        </Text>

        <ErrorMessage message={error} />

        <Input
          value={email}
          onChangeText={(t) => {
            setEmail(t);
            setError(null);
          }}
          placeholder="Enter your email"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="send"
          onSubmitEditing={() => {
            if (email.trim()) handleSendCode();
          }}
        />

        <View style={styles.buttonRow}>
          <Button
            title="Send Code"
            onPress={handleSendCode}
            loading={loading}
            disabled={!email.trim()}
          />
        </View>
      </FormScroll>

      <TouchableOpacity
        style={styles.bottomRow}
        onPress={() => navigation.navigate('Login')}
      >
        <Text style={styles.bottomText}>
          Remember Password? <Text style={styles.bottomLink}>Login</Text>
        </Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  backRow: {
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 8,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 24,
  },
  heading: {
    fontSize: 30,
    fontWeight: '700',
    color: '#1E232C',
    letterSpacing: -0.3,
    marginBottom: 8,
  },
  subtext: {
    fontSize: 16,
    fontWeight: '500',
    color: '#8391A1',
    lineHeight: 24,
    marginBottom: 28,
  },
  buttonRow: {
    marginTop: 8,
  },
  bottomRow: {
    paddingHorizontal: 24,
    paddingBottom: 24,
    alignItems: 'center',
  },
  bottomText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1E232C',
  },
  bottomLink: {
    color: '#DC143C',
  },
});
