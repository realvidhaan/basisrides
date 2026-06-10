import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Button } from '@/components/ui/Button';
import { ErrorMessage } from '@/components/ui/ErrorMessage';
import { webScreenFix } from '@/components/ui/FormScroll';
import { supabase, mapSupabaseError } from '@/lib/supabase';
import { useCurrentUser } from '@/hooks/useCurrentUser';

type DayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri';

const WEEKDAYS: { key: DayKey; label: string }[] = [
  { key: 'mon', label: 'Monday' },
  { key: 'tue', label: 'Tuesday' },
  { key: 'wed', label: 'Wednesday' },
  { key: 'thu', label: 'Thursday' },
  { key: 'fri', label: 'Friday' },
];

const MIN_SEATS = 0;
const MAX_SEATS = 6;

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function ProfileScreen() {
  const { user, loading } = useCurrentUser();

  const [availability, setAvailability] = useState<Record<DayKey, boolean>>({
    mon: false,
    tue: false,
    wed: false,
    thu: false,
    fri: false,
  });
  const [seats, setSeats] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);

  const seatsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Seed the stepper once the profile loads.
  useEffect(() => {
    if (user) setSeats(user.car_capacity);
  }, [user]);

  // Load existing availability for this user.
  useEffect(() => {
    if (!user) return;
    let active = true;
    void (async () => {
      try {
        const { data, error: loadError } = await supabase
          .from('availability')
          .select('day_of_week, is_driving')
          .eq('user_id', user.id);
        if (!active) return;
        if (loadError) {
          setError(mapSupabaseError(loadError));
          return;
        }
        const rows = (data ?? []) as unknown as {
          day_of_week: string;
          is_driving: boolean | null;
        }[];
        const next: Record<DayKey, boolean> = {
          mon: false,
          tue: false,
          wed: false,
          thu: false,
          fri: false,
        };
        for (const row of rows) {
          if (row.day_of_week in next) {
            next[row.day_of_week as DayKey] = Boolean(row.is_driving);
          }
        }
        setAvailability(next);
      } catch {
        if (active) setError('Could not load your availability.');
      }
    })();
    return () => {
      active = false;
    };
  }, [user]);

  // Clean up the debounce timer on unmount.
  useEffect(() => {
    return () => {
      if (seatsTimer.current) clearTimeout(seatsTimer.current);
    };
  }, []);

  async function toggleDay(key: DayKey, value: boolean): Promise<void> {
    if (!user) return;
    const previous = availability[key];
    setError(null);
    setAvailability((prev) => ({ ...prev, [key]: value }));
    try {
      const { error: upsertError } = await supabase
        .from('availability')
        .upsert(
          { user_id: user.id, day_of_week: key, is_driving: value },
          { onConflict: 'user_id,day_of_week' },
        );
      if (upsertError) {
        setAvailability((prev) => ({ ...prev, [key]: previous }));
        setError(mapSupabaseError(upsertError));
      }
    } catch {
      setAvailability((prev) => ({ ...prev, [key]: previous }));
      setError('Could not update availability. Please try again.');
    }
  }

  function changeSeats(delta: number): void {
    if (!user) return;
    const next = Math.min(MAX_SEATS, Math.max(MIN_SEATS, seats + delta));
    if (next === seats) return;
    setSeats(next);
    setError(null);

    if (seatsTimer.current) clearTimeout(seatsTimer.current);
    seatsTimer.current = setTimeout(() => {
      void (async () => {
        try {
          const { error: updateError } = await supabase
            .from('users')
            .update({ car_capacity: next })
            .eq('id', user.id);
          if (updateError) setError(mapSupabaseError(updateError));
        } catch {
          setError('Could not update your car capacity. Please try again.');
        }
      })();
    }, 500);
  }

  async function handleLogout(): Promise<void> {
    setLoggingOut(true);
    try {
      await supabase.auth.signOut();
    } catch {
      setLoggingOut(false);
      setError('Could not log out. Please try again.');
    }
    // On success App.tsx onAuthStateChange unmounts this screen.
  }

  return (
    <SafeAreaView style={[styles.container, webScreenFix]} edges={['top']}>
      <StatusBar style="dark" />

      <View style={styles.header}>
        <Text style={styles.title}>Profile</Text>
      </View>

      {loading ? (
        <View style={styles.loadingArea}>
          <ActivityIndicator color="#DC143C" size="large" />
        </View>
      ) : !user ? (
        <View style={styles.loadingArea}>
          <ErrorMessage message="Could not load your profile. Please try again." />
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {error ? <ErrorMessage message={error} /> : null}

          {/* User card */}
          <View style={styles.userCard}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initials(user.full_name)}</Text>
            </View>
            <Text style={styles.name}>{user.full_name}</Text>
            <Text style={styles.detail}>
              {user.child_name} · {user.grade} grade
            </Text>
            <Text style={styles.detailMuted}>{user.neighborhood}</Text>
          </View>

          {/* Availability */}
          <Text style={styles.sectionTitle}>Driving availability</Text>
          <Text style={styles.sectionSub}>
            Days you can drive the carpool.
          </Text>
          <View style={styles.card}>
            {WEEKDAYS.map(({ key, label }, idx) => (
              <View
                key={key}
                style={[
                  styles.toggleRow,
                  idx < WEEKDAYS.length - 1 && styles.toggleRowBorder,
                ]}
              >
                <Text style={styles.toggleLabel}>{label}</Text>
                <Switch
                  value={availability[key]}
                  onValueChange={(v) => toggleDay(key, v)}
                  trackColor={{ false: '#E8ECF4', true: '#DC143C' }}
                  thumbColor="#FFFFFF"
                  ios_backgroundColor="#E8ECF4"
                />
              </View>
            ))}
          </View>

          {/* Car capacity */}
          <Text style={styles.sectionTitle}>Your car</Text>
          <View style={styles.card}>
            <View style={styles.stepperRow}>
              <Text style={styles.toggleLabel}>Seats (including driver)</Text>
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
          </View>

          <View style={styles.logoutRow}>
            <Button
              title="Log out"
              variant="outline"
              onPress={handleLogout}
              loading={loggingOut}
            />
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E8ECF4',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1E232C',
  },
  loadingArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 24,
    paddingBottom: 40,
  },
  userCard: {
    alignItems: 'center',
    paddingVertical: 24,
    borderWidth: 1.5,
    borderColor: '#E8ECF4',
    borderRadius: 12,
    marginBottom: 32,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#DC143C',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '700',
  },
  name: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1E232C',
  },
  detail: {
    fontSize: 14,
    color: '#6A707C',
    marginTop: 4,
  },
  detailMuted: {
    fontSize: 14,
    color: '#8391A1',
    marginTop: 2,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1E232C',
    marginBottom: 4,
  },
  sectionSub: {
    fontSize: 13,
    color: '#8391A1',
    marginBottom: 12,
  },
  card: {
    borderWidth: 1.5,
    borderColor: '#E8ECF4',
    borderRadius: 12,
    paddingHorizontal: 16,
    marginBottom: 32,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
  },
  toggleRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E8ECF4',
  },
  toggleLabel: {
    fontSize: 15,
    fontWeight: '500',
    color: '#1E232C',
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
  },
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
  stepperDisabled: {
    color: '#C9CDD4',
  },
  stepperValue: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1E232C',
    minWidth: 40,
    textAlign: 'center',
  },
  logoutRow: {
    marginTop: 8,
  },
});
