import React, { useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import type { StackNavigationProp } from '@react-navigation/stack';
import * as Sentry from '@sentry/react-native';
import type { AuthStackParamList } from '@/types';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { ErrorMessage } from '@/components/ui/ErrorMessage';
import { BackButton } from '@/components/ui/BackButton';
import { supabase, mapSupabaseError } from '@/lib/supabase';
import { impact } from '@/lib/haptics';
import { DEMO_MODE } from '@/lib/demoMode';
import { DEMO_SIGNUP_PREFILL } from '@/lib/demo/fixtures';
import { colors } from '@/constants/theme/colors';

type LoginScreenNavigationProp = StackNavigationProp<AuthStackParamList, 'Login'>;

interface Props {
  navigation: LoginScreenNavigationProp;
}

export function LoginScreen({ navigation }: Props) {
  // Demo mode prefills the presenter's school address and password so signing in
  // on stage is a single tap. The fake client accepts any credentials.
  const [email, setEmail] = useState(DEMO_MODE ? DEMO_SIGNUP_PREFILL.acceptedEmail : '');
  const [password, setPassword] = useState(DEMO_MODE ? DEMO_SIGNUP_PREFILL.password : '');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const passwordRef = useRef<TextInput>(null);

  async function handleLogin(): Promise<void> {
    // Guard re-entry: the password field's onSubmitEditing can fire this again
    // while a sign-in is already in flight (the Button is disabled, the keyboard
    // action is not), causing a double submit.
    if (loading) return;
    setError(null);
    setLoading(true);

    const { error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    setLoading(false);

    if (authError) {
      Sentry.captureException(authError);
      setError(mapSupabaseError(authError));
    } else {
      // Confirm the successful sign-in with a tap before the gate navigates away.
      impact();
    }
    // On success, App.tsx onAuthStateChange drives navigation to HomeScreen.
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar style="dark" />

      <View style={styles.backRow}>
        <BackButton onPress={() => navigation.goBack()} />
      </View>

      <KeyboardAwareScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        extraScrollHeight={16}
      >
        <Text style={styles.heading}>
          Welcome back to Ridr. Glad to see you again!
        </Text>

        <ErrorMessage message={error} />

        <Input
          label="Email"
          value={email}
          onChangeText={(t) => {
            setEmail(t);
            setError(null);
          }}
          placeholder="Enter your email"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="next"
          onSubmitEditing={() => passwordRef.current?.focus()}
        />

        <Input
          ref={passwordRef}
          label="Password"
          value={password}
          onChangeText={(t) => {
            setPassword(t);
            setError(null);
          }}
          placeholder="Enter your password"
          secureTextEntry={!showPassword}
          autoCapitalize="none"
          returnKeyType="done"
          onSubmitEditing={handleLogin}
          rightAccessory={
            <TouchableOpacity onPress={() => setShowPassword((v) => !v)}>
              <Text style={styles.showHide}>{showPassword ? 'Hide' : 'Show'}</Text>
            </TouchableOpacity>
          }
        />

        <View style={styles.spacer} />

        <Button
          title="Login"
          onPress={handleLogin}
          loading={loading}
          disabled={!email || !password}
        />
      </KeyboardAwareScrollView>

      <TouchableOpacity
        style={styles.registerRow}
        onPress={() => navigation.navigate('Signup')}
      >
        <Text style={styles.registerText}>
          Don&apos;t have an account?{' '}
          <Text style={styles.registerLink}>Register Now</Text>
        </Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surfaceWhite,
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
    color: colors.ink,
    lineHeight: 39,
    letterSpacing: -0.3,
    marginBottom: 32,
  },
  showHide: {
    fontSize: 13,
    color: colors.brandTeal,
    fontWeight: '500',
    paddingLeft: 8,
  },
  spacer: {
    height: 16,
  },
  registerRow: {
    paddingHorizontal: 24,
    paddingBottom: 24,
    alignItems: 'center',
  },
  registerText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.ink,
  },
  registerLink: {
    color: colors.brandTeal,
  },
});
