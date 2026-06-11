import React, { useEffect, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import type { StackNavigationProp } from '@react-navigation/stack';
import type { ProfileStackParamList } from '@/types';
import { BackButton } from '@/components/ui/BackButton';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { ErrorMessage } from '@/components/ui/ErrorMessage';
import { webScreenFix } from '@/components/ui/FormScroll';
import { CarPicker } from '@/components/ui/CarPicker';
import { carColor, carType, type CarColorKey, type CarTypeKey } from '@/lib/carOptions';
import { supabase, mapSupabaseError } from '@/lib/supabase';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { geocodeAddress } from '@/lib/geocode';

type Nav = StackNavigationProp<ProfileStackParamList, 'EditProfile'>;

interface Props {
  navigation: Nav;
}

const MIN_SEATS = 0;
const MAX_SEATS = 6;

export function EditProfileScreen({ navigation }: Props) {
  const { user, loading, refetch } = useCurrentUser();

  const [fullName, setFullName] = useState('');
  const [childName, setChildName] = useState('');
  const [address, setAddress] = useState('');
  const [seats, setSeats] = useState(0);
  const [carColorKey, setCarColorKey] = useState<CarColorKey>('silver');
  const [carTypeKey, setCarTypeKey] = useState<CarTypeKey>('sedan');
  const [carModel, setCarModel] = useState('');
  const [plate, setPlate] = useState('');
  const [carModelError, setCarModelError] = useState<string | undefined>(undefined);
  const [seeded, setSeeded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Seed the form once the profile loads.
  useEffect(() => {
    if (user && !seeded) {
      setFullName(user.full_name);
      setChildName(user.child_name);
      setAddress(user.address ?? '');
      setSeats(user.car_capacity);
      setCarColorKey(carColor(user.car_color).key);
      setCarTypeKey(carType(user.car_type));
      setCarModel(user.car_model ?? '');
      setPlate(user.license_plate ?? '');
      setSeeded(true);
    }
  }, [user, seeded]);

  function changeSeats(delta: number): void {
    setSeats((s) => Math.min(MAX_SEATS, Math.max(MIN_SEATS, s + delta)));
  }

  async function handleSave(): Promise<void> {
    if (!user || saving) return;
    if (!fullName.trim()) {
      setError('Your name is required.');
      return;
    }
    if (!childName.trim()) {
      setError("Your child's name is required.");
      return;
    }
    if (address.trim().length < 6) {
      setError('Enter your home address so drivers know where to go.');
      return;
    }
    const hasCar = seats > 0;
    if (hasCar && !carModel.trim()) {
      setCarModelError('Tell parents your car so they can spot it at pickup.');
      setError(null);
      return;
    }
    setCarModelError(undefined);
    setSaving(true);
    setError(null);
    try {
      // Re-geocode only when the address actually changed.
      let lat = user.latitude;
      let lng = user.longitude;
      if (address.trim() !== (user.address ?? '').trim()) {
        const coords = await geocodeAddress(address.trim());
        lat = coords?.lat ?? null;
        lng = coords?.lng ?? null;
      }
      const { error: upErr } = await supabase
        .from('users')
        .update({
          full_name: fullName.trim(),
          child_name: childName.trim(),
          address: address.trim(),
          latitude: lat,
          longitude: lng,
          car_capacity: seats,
          car_color: hasCar ? carColorKey : null,
          car_type: hasCar ? carTypeKey : null,
          car_model: hasCar ? carModel.trim() : null,
          license_plate: hasCar && plate.trim() ? plate.trim() : null,
        })
        .eq('id', user.id);
      if (upErr) {
        setError(mapSupabaseError(upErr));
        return;
      }
      await refetch();
      navigation.goBack();
    } catch {
      setError('Could not save your changes. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={[styles.container, webScreenFix]} edges={['top']}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <BackButton onPress={() => navigation.goBack()} />
        <Text style={styles.title}>Edit information</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {error ? <ErrorMessage message={error} /> : null}

        {loading && !user ? (
          <Text style={styles.muted}>Loading…</Text>
        ) : (
          <>
            <Input
              label="Full name"
              value={fullName}
              onChangeText={setFullName}
              placeholder="Jane Smith"
            />
            <Input
              label="Child's name"
              value={childName}
              onChangeText={setChildName}
              placeholder="Alex Smith"
            />
            <Input
              label="Home address"
              value={address}
              onChangeText={setAddress}
              placeholder="123 Main St, Sunnyvale, CA"
            />
            <Text style={styles.helper}>
              Used so drivers know where to pick up and drop off. Shared only with
              parents in your carpool.
            </Text>

            <Text style={styles.fieldLabel}>Car seats (including driver)</Text>
            <View style={styles.stepperRow}>
              <Text style={styles.stepperHint}>Set 0 if you don&apos;t drive</Text>
              <View style={styles.stepper}>
                <TouchableOpacity
                  style={styles.stepperButton}
                  onPress={() => changeSeats(-1)}
                  disabled={seats <= MIN_SEATS}
                  accessibilityLabel="Decrease seats"
                >
                  <Text
                    style={[
                      styles.stepperSymbol,
                      seats <= MIN_SEATS && styles.stepperDisabled,
                    ]}
                  >
                    –
                  </Text>
                </TouchableOpacity>
                <Text style={styles.stepperValue}>{seats}</Text>
                <TouchableOpacity
                  style={styles.stepperButton}
                  onPress={() => changeSeats(1)}
                  disabled={seats >= MAX_SEATS}
                  accessibilityLabel="Increase seats"
                >
                  <Text
                    style={[
                      styles.stepperSymbol,
                      seats >= MAX_SEATS && styles.stepperDisabled,
                    ]}
                  >
                    +
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {seats > 0 ? (
              <View style={styles.carSection}>
                <Text style={styles.carSectionTitle}>Your vehicle</Text>
                <Text style={styles.carSectionHint}>
                  Shown to riders so they can spot your car at pickup.
                </Text>
                <CarPicker
                  values={{
                    colorKey: carColorKey,
                    type: carTypeKey,
                    model: carModel,
                    plate,
                  }}
                  onChange={(next) => {
                    setCarColorKey(next.colorKey);
                    setCarTypeKey(next.type);
                    setCarModel(next.model);
                    setPlate(next.plate);
                    if (carModelError && next.model.trim()) setCarModelError(undefined);
                  }}
                  modelError={carModelError}
                />
              </View>
            ) : null}

            <View style={styles.saveRow}>
              <Button title="Save changes" onPress={() => void handleSave()} loading={saving} />
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 12,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#DADADA',
  },
  title: { flex: 1, fontSize: 18, fontWeight: '700', color: '#1E232C' },
  headerSpacer: { width: 41 },
  scroll: { flex: 1 },
  scrollContent: { padding: 24, paddingBottom: 48 },
  muted: { fontSize: 14, color: '#8391A1' },
  helper: { fontSize: 12, color: '#8391A1', marginTop: -8, marginBottom: 16 },
  carSection: {
    backgroundColor: '#F7F8F9',
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
  },
  carSectionTitle: { fontSize: 15, fontWeight: '700', color: '#1E232C' },
  carSectionHint: {
    fontSize: 12,
    color: '#8391A1',
    marginTop: 2,
    marginBottom: 14,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: '#0A0A0A',
    marginBottom: 6,
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1.5,
    borderColor: '#E0E0E0',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginBottom: 24,
  },
  stepperHint: { fontSize: 13, color: '#6A707C' },
  stepper: { flexDirection: 'row', alignItems: 'center' },
  stepperButton: {
    width: 36,
    height: 36,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#E8ECF4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperSymbol: {
    fontSize: 20,
    fontWeight: '700',
    color: '#DC143C',
    lineHeight: 22,
  },
  stepperDisabled: { color: '#C9CDD4' },
  stepperValue: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1E232C',
    minWidth: 40,
    textAlign: 'center',
  },
  saveRow: { marginTop: 8 },
});
