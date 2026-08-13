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
import { Ionicons } from '@expo/vector-icons';
import type { StackNavigationProp } from '@react-navigation/stack';
import * as Sentry from '@sentry/react-native';
import type { AuthStackParamList, Grade, GeoPoint, SignupFormValues } from '@/types';
import { GRADES, NEIGHBORHOODS } from '@/types';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { SelectField } from '@/components/ui/SelectField';
import { LegalModal, type LegalDoc } from '@/components/legal/LegalModal';
import { ErrorMessage } from '@/components/ui/ErrorMessage';
import { FormScroll, webScreenFix } from '@/components/ui/FormScroll';
import { CarPicker } from '@/components/ui/CarPicker';
import { AddressAutocomplete } from '@/components/ui/AddressAutocomplete';
import type { CarColorKey, CarTypeKey } from '@/lib/carOptions';
import { supabase } from '@/lib/supabase';
import { createAccount } from '@/lib/account';
import { track } from '@/lib/analytics';
import { geocodeAddress } from '@/lib/geocode';
import { validatePlate } from '@/lib/licensePlate';
import { impact } from '@/lib/haptics';
import { DEMO_MODE } from '@/lib/demoMode';
import { DEMO_SCHOOL_EMAIL_DOMAIN, DEMO_SIGNUP_PREFILL } from '@/lib/demo/fixtures';

type SignupNavigationProp = StackNavigationProp<AuthStackParamList, 'Signup'>;

interface Props {
  navigation: SignupNavigationProp;
}

type FieldErrors = Partial<Record<keyof SignupFormValues, string>>;

const EMPTY_FORM: SignupFormValues = {
  inviteCode: '',
  fullName: '',
  childName: '',
  grade: '6th',
  neighborhood: '',
  address: '',
  carCapacity: '0',
  carColor: 'silver',
  carType: 'sedan',
  carState: '',
  licensePlate: '',
  email: '',
  password: '',
  confirmPassword: '',
  agreedToTerms: false,
};

/**
 * Demo mode substitutes an email-domain gate for the production invite code.
 *
 * This is a presentation affordance, not a claim about the product: nothing here
 * verifies school enrolment, and the copy says only what is true — that signing
 * up in this build requires a school-issued address. The domain lives in
 * `lib/demo/fixtures.ts` so changing schools is a one-line edit.
 */
const DEMO_SCHOOL_EMAIL_ERROR =
  `Use your school-issued email (name@${DEMO_SCHOOL_EMAIL_DOMAIN}). ` +
  'Personal addresses aren’t accepted.';

function isSchoolEmail(email: string): boolean {
  return email.trim().toLowerCase().endsWith(`@${DEMO_SCHOOL_EMAIL_DOMAIN}`);
}

/**
 * Every personal field the presenter would otherwise type on stage, straight from
 * the fixtures so there is exactly one source of truth for Robert Calder.
 *
 * The email is the PERSONAL address on purpose — it is meant to be rejected on the
 * first submit, and edited by hand to the school address. There is no car-model
 * field on this form (`SignupFormValues`), so the fixture's 'Honda Odyssey'
 * survives via the fake `create-account` merge instead of being prefilled here.
 */
const DEMO_FORM: SignupFormValues = {
  ...EMPTY_FORM,
  fullName: DEMO_SIGNUP_PREFILL.fullName,
  childName: DEMO_SIGNUP_PREFILL.childName,
  grade: DEMO_SIGNUP_PREFILL.grade as Grade,
  neighborhood: DEMO_SIGNUP_PREFILL.neighborhood,
  address: DEMO_SIGNUP_PREFILL.address,
  carCapacity: DEMO_SIGNUP_PREFILL.carCapacity,
  carColor: DEMO_SIGNUP_PREFILL.carColor,
  carType: DEMO_SIGNUP_PREFILL.carType,
  carState: DEMO_SIGNUP_PREFILL.carState,
  licensePlate: DEMO_SIGNUP_PREFILL.licensePlate,
  email: DEMO_SIGNUP_PREFILL.rejectedEmail,
  password: DEMO_SIGNUP_PREFILL.password,
  confirmPassword: DEMO_SIGNUP_PREFILL.password,
  agreedToTerms: true,
};

export function SignupScreen({ navigation }: Props) {
  const [form, setForm] = useState<SignupFormValues>(
    DEMO_MODE ? DEMO_FORM : EMPTY_FORM,
  );
  // Exact coordinates when the parent picks a suggested address; null if they
  // typed a freeform address (we'll geocode it on submit instead).
  // Demo mode seeds them so the blocking geocode round-trip below never happens.
  const [addressCoords, setAddressCoords] = useState<GeoPoint | null>(
    DEMO_MODE ? { ...DEMO_SIGNUP_PREFILL.coords } : null,
  );
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [legalDoc, setLegalDoc] = useState<LegalDoc | null>(null);

  const childNameRef = useRef<TextInput>(null);
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

  // Normalize an invite code the same way the DB does (strip non-alphanumerics,
  // upper-case) so "abcd-1234" and "ABCD 1234" both match the stored code.
  function normalizeCode(raw: string): string {
    return raw.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  }

  function validate(): boolean {
    const errors: FieldErrors = {};
    // Demo mode has no invite-code field to fill in — the school-email rule below
    // is the gate instead.
    if (!DEMO_MODE && !normalizeCode(form.inviteCode)) {
      errors.inviteCode = 'Enter the invite code from your BISV ParentSquare post.';
    }
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
    // Drivers (capacity > 0) must give a plate state and a structurally valid
    // plate for it. We don't require state for non-drivers (no car shown).
    if (!isNaN(cap) && cap > 0) {
      if (!form.carState) {
        errors.carState = 'Select the state your plate is from.';
      } else {
        const plateCheck = validatePlate(form.carState, form.licensePlate.trim());
        if (!plateCheck.ok) {
          errors.licensePlate = plateCheck.message ?? 'Enter a valid license plate.';
        }
      }
    }
    // Validate the trimmed value — the same value that gets submitted — so a
    // leading/trailing space (common from autofill) doesn't falsely reject a
    // valid address.
    const email = form.email.trim();
    let schoolEmailRejected = false;
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.email = 'Enter a valid email address.';
    } else if (DEMO_MODE && !isSchoolEmail(email)) {
      // On SUBMIT only, never per keystroke: the presenter edits the address by
      // hand after this fires, and a live-validating field would clear the error
      // mid-edit.
      errors.email = DEMO_SCHOOL_EMAIL_ERROR;
      schoolEmailRejected = true;
    }
    if (form.password.length < 8) {
      errors.password = 'Password must be at least 8 characters.';
    }
    if (form.password !== form.confirmPassword) {
      errors.confirmPassword = 'Passwords do not match.';
    }
    if (!form.agreedToTerms) {
      errors.agreedToTerms =
        'Please confirm you are a BISV parent/guardian and agree to the Terms and Privacy Policy.';
    }
    setFieldErrors(errors);
    // Mirror the address flow: surface a top banner when the plate/state is the
    // blocking problem, so the failure isn't only buried inline next to the field.
    if (errors.carState || errors.licensePlate) {
      setGlobalError(
        errors.carState
          ? 'Select the state your license plate is from, then re-check the plate. Fix the highlighted field and try again.'
          : "That license plate doesn't match a valid format for the selected state. Fix the highlighted field and try again.",
      );
    } else if (schoolEmailRejected) {
      setGlobalError(DEMO_SCHOOL_EMAIL_ERROR);
    }
    return Object.keys(errors).length === 0;
  }

  async function handleSignup(): Promise<void> {
    // Guard re-entry: the confirm-password field's onSubmitEditing can fire this
    // again while the invite-code / email-exists round-trips are still in flight
    // (the Button is disabled, the keyboard action is not), and the second pass
    // then reports the account it just created as "already registered".
    if (loading) return;
    setGlobalError(null);
    if (!validate()) return;

    setLoading(true);
    try {
      await runSignup();
    } catch (e) {
      // Every branch inside runSignup handles the errors it *expects* and
      // returns. This catches the ones it does not: any of the five awaited
      // calls can reject outright (offline, a Supabase 5xx, a thrown edge
      // function), and before this the reset never ran and the submit button
      // stayed disabled until the parent left the screen. `finally` is what
      // guarantees the flag clears, so the resets inside runSignup are gone.
      Sentry.captureException(e);
      setGlobalError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function runSignup(): Promise<void> {
    const email = form.email.trim().toLowerCase();
    const inviteCode = normalizeCode(form.inviteCode);

    // Pre-check the invite code so a bad/used code fails fast with a clear
    // message instead of a generic "couldn't create account" after the whole
    // form is submitted. The hard gate is a BEFORE INSERT trigger on auth.users
    // (migration 20260625090000) — this RPC is read-only UX. Fail open on a
    // transient RPC error: the trigger still blocks an invalid code server-side.
    //
    // Demo mode has no invite-code field, so there is nothing to pre-check.
    if (!DEMO_MODE) {
      const { data: codeValid, error: codeCheckError } = await supabase.rpc(
        'validate_invite_code',
        { p_code: inviteCode },
      );
      if (codeCheckError) Sentry.captureException(codeCheckError);
      if (!codeCheckError && !codeValid) {
        setFieldErrors((prev) => ({
          ...prev,
          inviteCode: "That invite code isn't valid.",
        }));
        setGlobalError(
          "That invite code isn't valid. Check the current code on your BISV ParentSquare post.",
        );
        return;
      }
    }

    // Pre-check: block signup if this email already belongs to an account.
    // Supabase's signUp obfuscates "user already registered" (anti-enumeration),
    // so it can silently no-op instead of erroring. Ask the DB directly via the
    // email_exists RPC (reads auth.users) and surface a clear inline + banner
    // error. Fail open on a transient RPC error — signUp still guards the unique
    // constraint, so we don't wrongly lock out a real new parent.
    const { data: emailTaken, error: emailCheckError } = await supabase.rpc(
      'email_exists',
      { p_email: email },
    );
    // Fail open on a transient lookup error (see above), but still report it.
    if (emailCheckError) Sentry.captureException(emailCheckError);
    if (!emailCheckError && emailTaken) {
      setFieldErrors((prev) => ({
        ...prev,
        email: 'An account with this email already exists. Log in instead.',
      }));
      setGlobalError(
        'That email is already registered. Try logging in or resetting your password.',
      );
      return;
    }

    // Resolve the address to real coordinates: trust a picked suggestion's exact
    // coords, otherwise geocode the freeform text. If neither yields a location
    // the address isn't a real, findable place — block signup and tell the parent
    // to choose one of the dropdown suggestions (so drivers get a valid pickup).
    const coords = addressCoords ?? (await geocodeAddress(form.address.trim()));
    if (!coords) {
      setFieldErrors((prev) => ({
        ...prev,
        address:
          "We couldn't find that address. Pick one from the dropdown suggestions as you type.",
      }));
      setGlobalError('Please choose a valid home address from the dropdown suggestions.');
      return;
    }

    // Create the account (no email confirmation for v1) and sign in immediately.
    // All profile fields ride along as metadata for the handle_new_user trigger.
    const hasCar = Number(form.carCapacity) > 0;
    const { ok, error: signUpError } = await createAccount(email, form.password, {
      invite_code: inviteCode,
      full_name: form.fullName.trim(),
      child_name: form.childName.trim(),
      grade: form.grade,
      neighborhood: form.neighborhood.trim(),
      address: form.address.trim(),
      latitude: String(coords.lat),
      longitude: String(coords.lng),
      car_capacity: String(Number(form.carCapacity)),
      car_color: hasCar ? form.carColor : '',
      car_type: hasCar ? form.carType : '',
      license_plate: hasCar ? form.licensePlate.trim() : '',
    });

    if (!ok) {
      // The invite-code trigger can reject server-side even after our pre-check
      // (e.g. the code was used by someone else in the meantime). Surface that
      // as an invite error rather than a generic failure.
      if (/invite/i.test(signUpError ?? '')) {
        setFieldErrors((prev) => ({
          ...prev,
          inviteCode: 'That invite code is no longer valid.',
        }));
        setGlobalError('That invite code is no longer valid. Check ParentSquare for the current code.');
        return;
      }
      setGlobalError(
        /registered|exists/i.test(signUpError ?? '')
          ? 'That email is already registered. Try logging in instead.'
          : signUpError ?? 'Could not create your account. Please try again.',
      );
      return;
    }

    // Sign in right away so the auth gate drops the parent into the app.
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password: form.password,
    });

    if (signInError) {
      Sentry.captureException(signInError);
      setGlobalError('Account created! Please log in to continue.');
      navigation.navigate('Login');
      return;
    }

    // Success — App.tsx onAuthStateChange drives navigation into the app.
    track('signup_completed', { is_driver: hasCar });
    impact();
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

        {DEMO_MODE ? null : (
          <>
            <Input
              label="Invite code"
              value={form.inviteCode}
              onChangeText={(t) => updateField('inviteCode', t)}
              placeholder="From your BISV ParentSquare post"
              autoCapitalize="characters"
              autoCorrect={false}
              error={fieldErrors.inviteCode}
              returnKeyType="next"
            />
            <Text style={styles.helperText}>
              BasisRide is invite-only for verified BISV families. Enter the code
              shared on ParentSquare.
            </Text>
          </>
        )}

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
        />

        <SelectField
          label="Grade"
          value={form.grade}
          options={GRADES.map((g) => ({ label: g, value: g }))}
          onChange={(val) => updateField('grade', val as Grade)}
        />

        <SelectField
          label="Neighborhood"
          value={form.neighborhood}
          placeholder="Select your city"
          options={NEIGHBORHOODS.map((city) => ({ label: city, value: city }))}
          onChange={(val) => updateField('neighborhood', val)}
          error={fieldErrors.neighborhood}
        />

        <AddressAutocomplete
          label="Home address"
          value={form.address}
          onChangeText={(t) => {
            updateField('address', t);
            // Typing invalidates a previously picked suggestion's coordinates.
            setAddressCoords(null);
          }}
          onSelect={(s) => {
            updateField('address', s.label);
            setAddressCoords({ lat: s.lat, lng: s.lng });
          }}
          placeholder="Start typing your address…"
          error={fieldErrors.address}
          helperText="Used so drivers know where to pick up and drop off. Shared only with parents in your carpool."
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
        <Text style={styles.helperText}>
          Enter 0 if you don&apos;t drive. Set 1 or more to add your car details
          below.
        </Text>

        {Number(form.carCapacity) > 0 ? (
          <View style={styles.carSection}>
            <Text style={styles.carSectionTitle}>Your vehicle</Text>
            <Text style={styles.carSectionHint}>
              Shown to riders so they can spot your car at pickup.
            </Text>
            <CarPicker
              values={{
                colorKey: form.carColor as CarColorKey,
                type: form.carType as CarTypeKey,
                state: form.carState,
                plate: form.licensePlate,
              }}
              onChange={(next) => {
                updateField('carColor', next.colorKey);
                updateField('carType', next.type);
                updateField('carState', next.state);
                updateField('licensePlate', next.plate);
              }}
              stateError={fieldErrors.carState}
              plateError={fieldErrors.licensePlate}
            />
          </View>
        ) : null}

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

        <TouchableOpacity
          style={styles.consentRow}
          onPress={() => updateField('agreedToTerms', !form.agreedToTerms)}
          activeOpacity={0.7}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: form.agreedToTerms }}
          accessibilityLabel="Agree to Terms and Privacy Policy"
        >
          <Ionicons
            name={form.agreedToTerms ? 'checkbox' : 'square-outline'}
            size={22}
            color={form.agreedToTerms ? '#DC143C' : '#8391A1'}
          />
          <Text style={styles.consentText}>
            I&apos;m a BISV parent/guardian and I agree to the{' '}
            <Text style={styles.consentLink} onPress={() => setLegalDoc('terms')}>
              Terms
            </Text>{' '}
            and{' '}
            <Text style={styles.consentLink} onPress={() => setLegalDoc('privacy')}>
              Privacy Policy
            </Text>
            , including the collection of my and my child&apos;s information.
          </Text>
        </TouchableOpacity>
        {fieldErrors.agreedToTerms ? (
          <Text style={styles.fieldError}>{fieldErrors.agreedToTerms}</Text>
        ) : null}

        <View style={styles.submitRow}>
          <Button title="Create account" onPress={handleSignup} loading={loading} />
        </View>
      </FormScroll>

      <LegalModal
        visible={legalDoc !== null}
        doc={legalDoc ?? 'privacy'}
        onClose={() => setLegalDoc(null)}
      />
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
  carSection: {
    backgroundColor: '#F7F8F9',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  carSectionTitle: { fontSize: 15, fontWeight: '700', color: '#1E232C' },
  carSectionHint: {
    fontSize: 12,
    color: '#6B6B6B',
    marginTop: 2,
    marginBottom: 14,
  },
  showHide: {
    fontSize: 13,
    color: '#DC143C',
    fontWeight: '500',
    paddingLeft: 8,
  },
  consentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginTop: 4,
    marginBottom: 4,
  },
  consentText: {
    flex: 1,
    fontSize: 13,
    color: '#6A707C',
    lineHeight: 19,
  },
  consentLink: {
    color: '#DC143C',
    fontWeight: '600',
  },
  submitRow: {
    marginTop: 8,
  },
  confirmBody: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 48,
    alignItems: 'center',
  },
  confirmEmoji: { fontSize: 56, marginBottom: 16 },
  confirmTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1E232C',
    marginBottom: 12,
  },
  confirmText: {
    fontSize: 15,
    color: '#6A707C',
    lineHeight: 22,
    textAlign: 'center',
  },
  confirmEmail: { fontWeight: '700', color: '#1E232C' },
  resentText: {
    fontSize: 14,
    color: '#16A34A',
    fontWeight: '600',
    marginTop: 20,
  },
  confirmActions: { alignSelf: 'stretch', marginTop: 32 },
  confirmGap: { height: 12 },
});
