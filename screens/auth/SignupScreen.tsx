import React, { useRef, useState } from 'react';
import {
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Picker } from '@react-native-picker/picker';
import type { StackNavigationProp } from '@react-navigation/stack';
import type { AuthStackParamList, Grade, SignupFormValues } from '@/types';
import { GRADES } from '@/types';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { ErrorMessage } from '@/components/ui/ErrorMessage';
import { supabase, mapSupabaseError } from '@/lib/supabase';

type SignupNavigationProp = StackNavigationProp<AuthStackParamList, 'Signup'>;

interface Props {
  navigation: SignupNavigationProp;
}

type FieldErrors = Partial<Record<keyof SignupFormValues, string>>;

export function SignupScreen({ navigation }: Props) {
  const [form, setForm] = useState<SignupFormValues>({
    fullName: '',
    childName: '',
    grade: '5th',
    neighborhood: '',
    carCapacity: '0',
    email: '',
    password: '',
    confirmPassword: '',
  });
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const childNameRef = useRef<TextInput>(null);
  const neighborhoodRef = useRef<TextInput>(null);
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
    if (!form.neighborhood.trim()) errors.neighborhood = 'Neighborhood is required.';
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

    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email: form.email.trim(),
      password: form.password,
    });

    if (signUpError || !signUpData.user) {
      setLoading(false);
      setGlobalError(mapSupabaseError(signUpError));
      return;
    }

    const { error: insertError } = await supabase.from('users').insert({
      id: signUpData.user.id,
      full_name: form.fullName.trim(),
      child_name: form.childName.trim(),
      grade: form.grade,
      neighborhood: form.neighborhood.trim(),
      car_capacity: Number(form.carCapacity),
      email: form.email.trim().toLowerCase(),
    });

    if (insertError) {
      await supabase.auth.signOut();
      setLoading(false);
      setGlobalError('Account setup failed. Please try again.');
      return;
    }

    setLoading(false);
    // App.tsx onAuthStateChange drives navigation to HomeScreen
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
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

      <KeyboardAwareScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        extraScrollHeight={16}
      >
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
          onSubmitEditing={() => neighborhoodRef.current?.focus()}
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

        <Input
          ref={neighborhoodRef}
          label="Neighborhood"
          value={form.neighborhood}
          onChangeText={(t) => updateField('neighborhood', t)}
          placeholder="Cupertino, Santa Clara…"
          error={fieldErrors.neighborhood}
          returnKeyType="next"
          onSubmitEditing={() => carCapacityRef.current?.focus()}
        />

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

        <View style={styles.submitRow}>
          <Button title="Create account" onPress={handleSignup} loading={loading} />
        </View>
      </KeyboardAwareScrollView>
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
