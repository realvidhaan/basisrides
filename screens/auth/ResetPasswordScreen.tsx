import React, { useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import type { RouteProp } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import * as Sentry from '@sentry/react-native';
import type { AuthStackParamList } from '@/types';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { ErrorMessage } from '@/components/ui/ErrorMessage';
import { BackButton } from '@/components/ui/BackButton';
import { FormScroll, webScreenFix } from '@/components/ui/FormScroll';
import { supabase, mapSupabaseError } from '@/lib/supabase';

type ResetNavigationProp = StackNavigationProp<AuthStackParamList, 'ResetPassword'>;
type ResetRoute = RouteProp<AuthStackParamList, 'ResetPassword'>;

interface Props {
  navigation: ResetNavigationProp;
  route: ResetRoute;
}

export function ResetPasswordScreen({ navigation }: Props) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const confirmRef = useRef<TextInput>(null);

  const canSubmit =
    password.length > 0 && confirmPassword.length > 0 && password === confirmPassword;

  function validate(): boolean {
    let valid = true;
    if (password.length < 8) {
      setPasswordError('Password must be at least 8 characters.');
      valid = false;
    }
    if (password !== confirmPassword) {
      setConfirmError('Passwords do not match.');
      valid = false;
    }
    return valid;
  }

  async function handleReset(): Promise<void> {
    setGlobalError(null);
    if (!validate()) return;

    setLoading(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (updateError) {
      Sentry.captureException(updateError);
      setGlobalError(mapSupabaseError(updateError));
      return;
    }

    navigation.replace('PasswordChanged');
  }

  return (
    <SafeAreaView style={[styles.container, webScreenFix]} edges={['top']}>
      <StatusBar style="dark" />

      <View style={styles.backRow}>
        <BackButton onPress={() => navigation.goBack()} />
      </View>

      <FormScroll style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <Text style={styles.heading}>Create new password</Text>
        <Text style={styles.subtext}>
          Your new password must be different from previously used passwords.
        </Text>

        <ErrorMessage message={globalError} />

        <Input
          label="New Password"
          value={password}
          onChangeText={(t) => {
            setPassword(t);
            setPasswordError(null);
            setGlobalError(null);
          }}
          placeholder="Min. 8 characters"
          secureTextEntry={!showPassword}
          autoCapitalize="none"
          error={passwordError}
          returnKeyType="next"
          onSubmitEditing={() => confirmRef.current?.focus()}
          rightAccessory={
            <TouchableOpacity onPress={() => setShowPassword((v) => !v)}>
              <Text style={styles.showHide}>{showPassword ? 'Hide' : 'Show'}</Text>
            </TouchableOpacity>
          }
        />

        <Input
          ref={confirmRef}
          label="Confirm Password"
          value={confirmPassword}
          onChangeText={(t) => {
            setConfirmPassword(t);
            setConfirmError(null);
            setGlobalError(null);
          }}
          placeholder="Re-enter password"
          secureTextEntry={!showConfirm}
          autoCapitalize="none"
          error={confirmError}
          returnKeyType="done"
          onSubmitEditing={handleReset}
          rightAccessory={
            <TouchableOpacity onPress={() => setShowConfirm((v) => !v)}>
              <Text style={styles.showHide}>{showConfirm ? 'Hide' : 'Show'}</Text>
            </TouchableOpacity>
          }
        />

        <View style={styles.buttonRow}>
          <Button
            title="Reset Password"
            onPress={handleReset}
            loading={loading}
            disabled={!canSubmit}
          />
        </View>
      </FormScroll>
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
  showHide: {
    fontSize: 13,
    color: '#DC143C',
    fontWeight: '500',
    paddingLeft: 8,
  },
  buttonRow: {
    marginTop: 8,
  },
});
