import React, { useRef, useState } from 'react';
import {
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Picker } from '@react-native-picker/picker';
import type { StackNavigationProp } from '@react-navigation/stack';
import type { AuthStackParamList, Grade, SignupFormValues } from '@/types';
import { GRADES, NEIGHBORHOODS } from '@/types';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { ErrorMessage } from '@/components/ui/ErrorMessage';
import { FormScroll, webScreenFix } from '@/components/ui/FormScroll';
import { supabase, mapSupabaseError } from '@/lib/supabase';
import { geocodeAddress } from '@/lib/geocode';
import { setRecovering } from '@/lib/authFlow';

type SignupNavigationProp = StackNavigationProp<AuthStackParamList, 'Signup'>;

interface Props {
  navigation: SignupNavigationProp;
}

type FieldErrors = Partial<Record<keyof SignupFormValues, string>>;

export function SignupScreen({ navigation }: Props) {
  const [form, setForm] = useState<SignupFormValues>({
    fullName: '',
    childName: '',
    grade: '6th',
    neighborhood: '',
    address: '',
    carCapacity: '0',
    email: '',
    password: '',
    confirmPassword: '',
  });
  const [inviteCode, setInviteCode] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const childNameRef = useRef<TextInput>(null);
  const addressRef = useRef<TextInput>(null);
  const carCapacityRef = useRef<TextInput>(null);
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const confirmPasswordRef = useRef<TextInput>(null);

  function updateField<K extends keyof SignupFormValues>(
    key: K,
    value: SignupFormValues[K],
  ): void {
    setForm((prev) => ({ ...prev, [key]: value }));
    setFieldErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  function validate(): boolean {
    const errors: FieldErrors = {};
    if (!form.fullName.trim()) errors.fullName = 'Full name is required.';
    if (!form.childName.trim()) errors.childName = "Child's name is required.";
    if (!form.neighborhood) errors.neighborhood = 'Please select your city.';
    if (!form.address.trim() || form.address.trim().length < 6) {
      errors.address = 'Enter your home address so drivers know where to go.';
    }
    const cap = Number(form.carCapacity);
    if (!form.carCapacity.trim() || isNaN(cap) || cap < 0 || cap > 6) {
      errors.carCapacity = 'Enter a number from 0 to 6.';
    }
    if (!form.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      errors.email = 'Enter a valid email address.';
    }
    if (form.password.length < 8) {
      errors.password = 'Password must be at least 8 characters.';
    }
    if (form.password !== form.confirmPassword) {
      errors.confirmPassword = 'Passwords do not match.';
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleSignup(): Promise<void> {
    setGlobalError(null);
    if (!validate()) return;

    setLoading(true);

    // Creating an account is never part of a password reset. Clear any stale
    // recovery flag so the auth gate opens once the session is created.
    setRecovering(false);

    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email: form.email.trim(),
      password: form.password,
    });

    if (signUpError || !signUpData.user) {
      setLoading(false);
      setGlobalError(mapSupabaseError(signUpError));
      return;
    }

    // Geocode the home address (free, best-effort) so the live map can pin it.
    const coords = await geocodeAddress(form.address.trim());

    const { error: insertError } = await supabase.from('users').insert({
      id: signUpData.user.id,
      full_name: form.fullName.trim(),
      child_name: form.childName.trim(),
      grade: form.grade,
      neighborhood: form.neighborhood.trim(),
      address: form.address.trim(),
      latitude: coords?.lat ?? null,
      longitude: coords?.lng ?? null,
      car_capacity: Number(form.carCapacity),
      email: form.email.trim().toLowerCase(),
    });

    if (insertError) {
      await supabase.auth.signOut();
      setLoading(false);
      setGlobalError('Account setup failed. Please try again.');
      return;
    }

    // If they came in with an invite code, redeem it (best-effort).
    const code = inviteCode.trim().toUpperCase();
    if (code) {
      try {
        await supabase.rpc('redeem_invite', { p_code: code });
      } catch {
        // Non-fatal: a bad/used code shouldn't block account creation.
      }
    }

    setLoading(false);
    // App.tsx onAuthStateChange drives navigation to HomeScreen
  }

  return (
    <SafeAreaView style={[styles.container, webScreenFix]} edges={['top']}>
      <StatusBar style="dark" />

      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Text style={styles.backChevron}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Create your account</Text>
      </View>

      <FormScroll style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <ErrorMessage message={globalError} />

        <Input
          label="Full name"
          value={form.fullName}
          onChangeText={(t) => updateField('fullName', t)}
          placeholder="Jane Smith"
          error={fieldErrors.fullName}
          returnKeyType="next"
          onSubmitEditing={() => childNameRef.current?.focus()}
        />

        <Input
          ref={childNameRef}
          label="Child's name"
          value={form.childName}
          onChangeText={(t) => updateField('childName', t)}
          placeholder="Alex Smith"
          error={fieldErrors.childName}
          returnKeyType="next"
          onSubmitEditing={() => addressRef.current?.focus()}
        />

        <View style={styles.pickerWrapper}>
          <Text style={styles.pickerLabel}>Grade</Text>
          <View style={styles.pickerContainer}>
            <Picker<Grade>
              selectedValue={form.grade}
              onValueChange={(val) => updateField('grade', val)}
              style={styles.picker}
              itemStyle={styles.pickerItem}
            >
              {GRADES.map((g) => (
                <Picker.Item key={g} label={g} value={g} />
              ))}
            </Picker>
          </View>
        </View>

        <View style={styles.pickerWrapper}>
          <Text style={styles.pickerLabel}>Neighborhood</Text>
          <View
            style={[
              styles.pickerContainer,
              fieldErrors.neighborhood ? styles.pickerContainerError : null,
            ]}
          >
            <Picker<string>
              selectedValue={form.neighborhood}
              onValueChange={(val) => updateField('neighborhood', val)}
              style={styles.picker}
              itemStyle={styles.pickerItem}
            >
              <Picker.Item label="Select your city" value="" color="#A0A0A0" />
              {NEIGHBORHOODS.map((city) => (
                <Picker.Item key={city} label={city} value={city} />
              ))}
            </Picker>
          </View>
          {fieldErrors.neighborhood ? (
            <Text style={styles.fieldError}>{fieldErrors.neighborhood}</Text>
          ) : null}
        </View>

        <Input
          ref={addressRef}
          label="Home address"
          value={form.address}
          onChangeText={(t) => updateField('address', t)}
          placeholder="123 Main St, Sunnyvale, CA"
          error={fieldErrors.address}
          returnKeyType="next"
          onSubmitEditing={() => carCapacityRef.current?.focus()}
        />
        <Text style={styles.helperText}>
          Used so drivers know where to pick up and drop off. Shared only with
          parents in your carpool.
        </Text>

        <Input
          ref={carCapacityRef}
          label="Car capacity"
          value={form.carCapacity}
          onChangeText={(t) => updateField('carCapacity', t)}
          placeholder="4"
          keyboardType="number-pad"
          error={fieldErrors.carCapacity}
          returnKeyType="next"
          onSubmitEditing={() => emailRef.current?.focus()}
        />
        <Text style={styles.helperText}>Enter 0 if you don't drive</Text>

        <Input
          ref={emailRef}
          label="Email"
          value={form.email}
          onChangeText={(t) => updateField('email', t)}
          placeholder="you@example.com"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          error={fieldErrors.email}
          returnKeyType="next"
          onSubmitEditing={() => passwordRef.current?.focus()}
        />

        <Input
          ref={passwordRef}
          label="Password"
          value={form.password}
          onChangeText={(t) => updateField('password', t)}
          placeholder="Min. 8 characters"
          secureTextEntry={!showPassword}
          autoCapitalize="none"
          error={fieldErrors.password}
          returnKeyType="next"
          onSubmitEditing={() => confirmPasswordRef.current?.focus()}
          rightAccessory={
            <TouchableOpacity onPress={() => setShowPassword((v) => !v)}>
              <Text style={styles.showHide}>{showPassword ? 'Hide' : 'Show'}</Text>
            </TouchableOpacity>
          }
        />

        <Input
          ref={confirmPasswordRef}
          label="Confirm password"
          value={form.confirmPassword}
          onChangeText={(t) => updateField('confirmPassword', t)}
          placeholder="Re-enter password"
          secureTextEntry={!showConfirm}
          autoCapitalize="none"
          error={fieldErrors.confirmPassword}
          returnKeyType="done"
          onSubmitEditing={handleSignup}
          rightAccessory={
            <TouchableOpacity onPress={() => setShowConfirm((v) => !v)}>
              <Text style={styles.showHide}>{showConfirm ? 'Hide' : 'Show'}</Text>
            </TouchableOpacity>
          }
        />

        <Input
          label="Invite code (optional)"
          value={inviteCode}
          onChangeText={setInviteCode}
          placeholder="From a parent who invited you"
          autoCapitalize="characters"
          autoCorrect={false}
        />

        <View style={styles.submitRow}>
          <Button title="Create account" onPress={handleSignup} loading={loading} />
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E0E0E0',
  },
  backButton: {
    marginRight: 12,
  },
  backChevron: {
    fontSize: 32,
    color: '#0A0A0A',
    lineHeight: 36,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0A0A0A',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    padding: 24,
    paddingBottom: 48,
  },
  pickerWrapper: {
    marginBottom: 16,
  },
  pickerLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: '#0A0A0A',
    marginBottom: 6,
  },
  pickerContainer: {
    borderWidth: 1.5,
    borderColor: '#E0E0E0',
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
    height: Platform.OS === 'ios' ? 160 : 52,
    justifyContent: 'center',
  },
  pickerContainerError: {
    borderColor: '#DC143C',
  },
  fieldError: {
    fontSize: 12,
    color: '#DC143C',
    marginTop: 4,
  },
  picker: {
    color: '#0A0A0A',
  },
  pickerItem: {
    fontSize: 15,
    color: '#0A0A0A',
  },
  helperText: {
    fontSize: 12,
    color: '#6B6B6B',
    marginTop: -10,
    marginBottom: 16,
  },
  showHide: {
    fontSize: 13,
    color: '#DC143C',
    fontWeight: '500',
    paddingLeft: 8,
  },
  submitRow: {
    marginTop: 8,
  },
});
