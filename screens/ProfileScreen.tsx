import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
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
import { cityZone } from '@/lib/zones';

const MIN_SEATS = 0;
const MAX_SEATS = 6;
const HARDSHIP_LIMIT = 2;

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

// Unique realtime topic per mount (matches the Day 2 channel pattern).
let profileChannelSeq = 0;

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function ProfileScreen() {
  const { user, loading } = useCurrentUser();

  const [seats, setSeats] = useState<number>(0);
  const [passesLeft, setPassesLeft] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);

  const seatsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (user) setSeats(user.car_capacity);
  }, [user]);

  // Hardship passes remaining this calendar month (max 2), kept live via
  // realtime so it updates the moment a pass is used or undone elsewhere.
  const monthName = MONTH_NAMES[new Date().getMonth()];
  useEffect(() => {
    if (!user) return;
    let active = true;

    async function fetchPasses(): Promise<void> {
      try {
        const now = new Date();
        const first = `${now.getFullYear()}-${`${now.getMonth() + 1}`.padStart(2, '0')}-01`;
        const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
        const nextFirst = `${next.getFullYear()}-${`${next.getMonth() + 1}`.padStart(2, '0')}-01`;
        const { count } = await supabase
          .from('hardship_passes')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user!.id)
          .gte('pass_date', first)
          .lt('pass_date', nextFirst);
        if (active) setPassesLeft(Math.max(0, HARDSHIP_LIMIT - (count ?? 0)));
      } catch {
        if (active) setPassesLeft(null);
      }
    }

    void fetchPasses();

    profileChannelSeq += 1;
    const channel = supabase
      .channel(`profile-passes-${profileChannelSeq}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'hardship_passes',
          filter: `user_id=eq.${user.id}`,
        },
        () => void fetchPasses(),
      )
      .subscribe();

    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [user]);

  useEffect(() => {
    return () => {
      if (seatsTimer.current) clearTimeout(seatsTimer.current);
    };
  }, []);

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

          <View style={styles.userCard}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initials(user.full_name)}</Text>
            </View>
            <Text style={styles.name}>{user.full_name}</Text>
            <Text style={styles.email}>{user.email}</Text>
            <Text style={styles.detail}>
              {user.child_name} · {user.grade} grade
            </Text>
            <View style={styles.zoneRow}>
              <Text style={styles.detailMuted}>{user.neighborhood}</Text>
              <View style={styles.zoneBadge}>
                <Text style={styles.zoneBadgeText}>
                  {cityZone(user.neighborhood)} zone
                </Text>
              </View>
            </View>
          </View>

          <Text style={styles.sectionTitle}>Your car</Text>
          <View style={styles.card}>
            <View style={styles.stepperRow}>
              <Text style={styles.rowLabel}>Seats (including driver)</Text>
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

          <Text style={styles.sectionTitle}>Driving rotation</Text>
          <View style={styles.card}>
            <View style={styles.stepperRow}>
              <View style={styles.passLabelWrap}>
                <Text style={styles.rowLabel}>Hardship passes left</Text>
                <Text style={styles.passHint}>
                  {monthName} · resets each month
                </Text>
              </View>
              <Text style={styles.passValue}>
                {passesLeft === null ? '—' : `${passesLeft}/${HARDSHIP_LIMIT}`}
              </Text>
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
  email: {
    fontSize: 13,
    color: '#8391A1',
    marginTop: 2,
  },
  detail: {
    fontSize: 14,
    color: '#6A707C',
    marginTop: 8,
  },
  zoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  detailMuted: {
    fontSize: 14,
    color: '#8391A1',
  },
  zoneBadge: {
    backgroundColor: '#FFF1F1',
    borderRadius: 9999,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  zoneBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#DC143C',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1E232C',
    marginBottom: 12,
  },
  card: {
    borderWidth: 1.5,
    borderColor: '#E8ECF4',
    borderRadius: 12,
    paddingHorizontal: 16,
    marginBottom: 32,
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
  },
  rowLabel: {
    fontSize: 15,
    fontWeight: '500',
    color: '#1E232C',
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
  passLabelWrap: { flex: 1 },
  passHint: { fontSize: 12, color: '#8391A1', marginTop: 2 },
  passValue: {
    fontSize: 17,
    fontWeight: '700',
    color: '#DC143C',
  },
  logoutRow: {
    marginTop: 8,
  },
});
