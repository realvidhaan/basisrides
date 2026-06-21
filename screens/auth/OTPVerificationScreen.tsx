import React, { useRef, useState } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  type NativeSyntheticEvent,
  type TextInputKeyPressEventData,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import type { RouteProp } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import type { AuthStackParamList } from '@/types';
import { Button } from '@/components/ui/Button';
import { ErrorMessage } from '@/components/ui/ErrorMessage';
import { BackButton } from '@/components/ui/BackButton';
import { supabase } from '@/lib/supabase';
import { sendAuthEmail } from '@/lib/authEmail';
import { setRecovering } from '@/lib/authFlow';

type OTPNavigationProp = StackNavigationProp<AuthStackParamList, 'OTPVerification'>;
type OTPRoute = RouteProp<AuthStackParamList, 'OTPVerification'>;

interface Props {
  navigation: OTPNavigationProp;
  route: OTPRoute;
}

const OTP_LENGTH = 8;

export function OTPVerificationScreen({ navigation, route }: Props) {
  const { email, flow } = route.params;

  const [digits, setDigits] = useState<string[]>(Array(OTP_LENGTH).fill(''));
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resendNote, setResendNote] = useState<string | null>(null);
  const [resending, setResending] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);

  const inputs = useRef<Array<TextInput | null>>([]);

  const code = digits.join('');
  const isComplete = code.length === OTP_LENGTH;

  function handleChange(text: string, index: number): void {
    const clean = text.replace(/[^0-9]/g, '');
    setError(null);
    setResendNote(null);

    if (clean.length === 0) {
      setDigits((prev) => {
        const next = [...prev];
        next[index] = '';
        return next;
      });
      return;
    }

    if (clean.length === 1) {
      setDigits((prev) => {
        const next = [...prev];
        next[index] = clean;
        return next;
      });
      if (index < OTP_LENGTH - 1) {
        inputs.current[index + 1]?.focus();
      }
      return;
    }

    // Multi-character input (paste or fast typing): distribute from this box.
    const chars = clean.slice(0, OTP_LENGTH - index).split('');
    setDigits((prev) => {
      const next = [...prev];
      chars.forEach((char, i) => {
        next[index + i] = char;
      });
      return next;
    });
    const lastFilled = Math.min(index + chars.length, OTP_LENGTH - 1);
    inputs.current[lastFilled]?.focus();
  }

  function handleKeyPress(
    event: NativeSyntheticEvent<TextInputKeyPressEventData>,
    index: number,
  ): void {
    if (event.nativeEvent.key === 'Backspace' && digits[index] === '' && index > 0) {
      inputs.current[index - 1]?.focus();
      setDigits((prev) => {
        const next = [...prev];
        next[index - 1] = '';
        return next;
      });
    }
  }

  async function handleVerify(): Promise<void> {
    if (!isComplete) return;
    setError(null);
    setLoading(true);

    // Enter recovery mode *before* verifyOtp so the session it creates does not
    // bounce the user to the main stack before they reach ResetPassword.
    if (flow === 'reset') {
      setRecovering(true);
    }

    // Signup confirmation is delivered as a magiclink code (see lib/authEmail),
    // so it verifies with type 'email'; password reset verifies with 'recovery'.
    const { error: verifyError } = await supabase.auth.verifyOtp({
      email,
      token: code,
      type: flow === 'reset' ? 'recovery' : 'email',
    });

    setLoading(false);

    if (verifyError) {
      if (flow === 'reset') {
        setRecovering(false);
      }
      setError('Incorrect code. Please try again.');
      return;
    }

    if (flow === 'reset') {
      navigation.navigate('ResetPassword', { email });
    }
    // For the signup flow, verifyOtp establishes a session and App.tsx's
    // onAuthStateChange drives navigation to Home automatically.
  }

  async function handleResend(): Promise<void> {
    setError(null);
    setResendNote(null);
    setResending(true);

    const { ok } = await sendAuthEmail(
      flow === 'reset' ? 'recovery' : 'signup',
      email,
    );

    setResending(false);

    if (!ok) {
      setError('Could not resend the code. Please try again.');
      return;
    }
    setResendNote('Code resent!');
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar style="dark" />

      <View style={styles.backRow}>
        <BackButton onPress={() => navigation.goBack()} />
      </View>

      <View style={styles.content}>
        <Text style={styles.heading}>OTP Verification</Text>
        <Text style={styles.subtext}>
          Enter the verification code we sent to{'\n'}
          <Text style={styles.email}>{email}</Text>
        </Text>

        <ErrorMessage message={error} />

        <View style={styles.otpRow}>
          {digits.map((digit, index) => (
            <TextInput
              key={index}
              ref={(el) => {
                inputs.current[index] = el;
              }}
              style={[
                styles.otpBox,
                (digit || focusedIndex === index) ? styles.otpBoxActive : null,
              ]}
              value={digit}
              onChangeText={(text) => handleChange(text, index)}
              onKeyPress={(event) => handleKeyPress(event, index)}
              onFocus={() => setFocusedIndex(index)}
              onBlur={() => setFocusedIndex((cur) => (cur === index ? null : cur))}
              keyboardType="number-pad"
              returnKeyType={index === OTP_LENGTH - 1 ? 'done' : 'next'}
              textContentType="oneTimeCode"
              autoComplete="sms-otp"
              selectTextOnFocus
              autoFocus={index === 0}
              accessibilityLabel={`Digit ${index + 1}`}
            />
          ))}
        </View>

        <View style={styles.buttonRow}>
          <Button
            title="Verify"
            onPress={handleVerify}
            loading={loading}
            disabled={!isComplete}
          />
        </View>

        <View style={styles.resendRow}>
          {resendNote ? (
            <Text style={styles.resendNote}>{resendNote}</Text>
          ) : (
            <TouchableOpacity onPress={handleResend} disabled={resending}>
              <Text style={styles.resendText}>
                Didn&apos;t receive code?{' '}
                <Text style={styles.resendLink}>
                  {resending ? 'Resending…' : 'Resend'}
                </Text>
              </Text>
            </TouchableOpacity>
          )}
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
  backRow: {
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 8,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 8,
  },
  heading: {
    fontSize: 30,
    fontWeight: '700',
    color: '#1E232C',
    letterSpacing: -0.3,
    marginBottom: 8,
  },
  subtext: {
    fontSize: 15,
    fontWeight: '500',
    color: '#8391A1',
    lineHeight: 22,
    marginBottom: 28,
  },
  email: {
    color: '#1E232C',
    fontWeight: '600',
  },
  otpRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 28,
    maxWidth: 380,
    alignSelf: 'center',
    width: '100%',
  },
  otpBox: {
    width: 36,
    height: 50,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#DADADA',
    backgroundColor: '#FFFFFF',
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '600',
    color: '#1E232C',
  },
  otpBoxActive: {
    borderColor: '#DC143C',
  },
  buttonRow: {
    marginBottom: 24,
  },
  resendRow: {
    alignItems: 'center',
  },
  resendText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#6A707C',
  },
  resendLink: {
    fontWeight: '700',
    color: '#DC143C',
  },
  resendNote: {
    fontSize: 15,
    fontWeight: '600',
    color: '#16A34A',
  },
});
