import React, { useRef, useState } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import type { StackNavigationProp } from '@react-navigation/stack';
import type { AuthStackParamList } from '@/types';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { ErrorMessage } from '@/components/ui/ErrorMessage';
import { supabase, mapSupabaseError } from '@/lib/supabase';

type LoginScreenNavigationProp = StackNavigationProp<AuthStackParamList, 'Login'>;

interface Props {
  navigation: LoginScreenNavigationProp;
}

export function LoginScreen({ navigation }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const passwordRef = useRef<TextInput>(null);

  async function handleLogin(): Promise<void> {
    setError(null);
    setLoading(true);

    const { error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    setLoading(false);

    if (authError) {
      setError(mapSupabaseError(authError));
    }
    // On success, App.tsx onAuthStateChange drives navigation to HomeScreen
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />

      <View style={styles.inner}>
        <Text style={styles.wordmark}>BasisRide</Text>
        <Text style={styles.subtitle}>Carpool for BISV families</Text>

        <View style={styles.form}>
          <ErrorMessage message={error} />

          <Input
            label="Email"
            value={email}
            onChangeText={(t) => {
              setEmail(t);
              setError(null);
            }}
            placeholder="you@example.com"
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
            placeholder="••••••••"
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

          <View style={styles.buttonRow}>
            <Button
              title="Log in"
              onPress={handleLogin}
              loading={loading}
              disabled={!email || !password}
            />
          </View>
        </View>

        <TouchableOpacity
          onPress={() => navigation.navigate('Signup')}
          style={styles.signupLink}
        >
          <Text style={styles.signupLinkText}>
            New to BasisRide?{' '}
            <Text style={styles.signupLinkBold}>Sign up</Text>
          </Text>
        </TouchableOpacity>
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
    paddingHorizontal: 24,
    justifyContent: 'center',
  },
  wordmark: {
    fontSize: 36,
    fontWeight: '700',
    color: '#DC143C',
    marginBottom: 8,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 15,
    color: '#6B6B6B',
    marginBottom: 40,
  },
  form: {
    width: '100%',
  },
  buttonRow: {
    marginTop: 8,
  },
  signupLink: {
    position: 'absolute',
    bottom: 32,
    alignSelf: 'center',
  },
  signupLinkText: {
    fontSize: 14,
    color: '#6B6B6B',
  },
  signupLinkBold: {
    color: '#DC143C',
    fontWeight: '600',
  },
  showHide: {
    fontSize: 13,
    color: '#DC143C',
    fontWeight: '500',
    paddingLeft: 8,
  },
});
