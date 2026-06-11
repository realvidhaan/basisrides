import React, { useEffect, useState } from 'react';
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
import { Ionicons } from '@expo/vector-icons';
import type { StackNavigationProp } from '@react-navigation/stack';
import type { ProfileStackParamList } from '@/types';
import { Button } from '@/components/ui/Button';
import { ErrorMessage } from '@/components/ui/ErrorMessage';
import { webScreenFix } from '@/components/ui/FormScroll';
import { supabase } from '@/lib/supabase';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { cityZone } from '@/lib/zones';

const HARDSHIP_LIMIT = 2;

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// Unique realtime topic per mount (matches the app's channel pattern).
let profileChannelSeq = 0;

type ProfileNavigationProp = StackNavigationProp<ProfileStackParamList, 'Profile'>;

interface Props {
  navigation: ProfileNavigationProp;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function ProfileScreen({ navigation }: Props) {
  const { user, loading } = useCurrentUser();

  const [passesLeft, setPassesLeft] = useState<number | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);

  const monthName = MONTH_NAMES[new Date().getMonth()];

  // Hardship passes remaining this calendar month, live via realtime.
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

  async function handleLogout(): Promise<void> {
    setLoggingOut(true);
    try {
      await supabase.auth.signOut();
    } catch {
      setLoggingOut(false);
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

          {/* Quick read-only facts */}
          <View style={styles.factsCard}>
            <View style={styles.factRow}>
              <Text style={styles.factLabel}>Home address</Text>
              <Text style={styles.factValue} numberOfLines={2}>
                {user.address ?? 'Not set'}
              </Text>
            </View>
            <View style={styles.factDivider} />
            <View style={styles.factRow}>
              <Text style={styles.factLabel}>Car seats</Text>
              <Text style={styles.factValue}>
                {user.car_capacity > 0
                  ? `${user.car_capacity} (incl. driver)`
                  : 'No car'}
              </Text>
            </View>
          </View>

          <TouchableOpacity
            style={styles.actionRow}
            onPress={() => navigation.navigate('EditProfile')}
            activeOpacity={0.7}
          >
            <Ionicons name="create-outline" size={20} color="#DC143C" />
            <Text style={styles.actionText}>Edit information</Text>
            <Ionicons name="chevron-forward" size={18} color="#8391A1" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionRow}
            onPress={() => navigation.navigate('Invite')}
            activeOpacity={0.7}
          >
            <Ionicons name="person-add-outline" size={20} color="#DC143C" />
            <Text style={styles.actionText}>Invite parents</Text>
            <Ionicons name="chevron-forward" size={18} color="#8391A1" />
          </TouchableOpacity>

          <Text style={styles.sectionTitle}>Driving rotation</Text>
          <View style={styles.card}>
            <View style={styles.passRow}>
              <View style={styles.passLabelWrap}>
                <Text style={styles.rowLabel}>Hardship passes left</Text>
                <Text style={styles.passHint}>{monthName} · resets each month</Text>
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
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  header: {
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E8ECF4',
  },
  title: { fontSize: 24, fontWeight: '700', color: '#1E232C' },
  loadingArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  scroll: { flex: 1 },
  scrollContent: { padding: 24, paddingBottom: 40 },
  userCard: {
    alignItems: 'center',
    paddingVertical: 24,
    borderWidth: 1.5,
    borderColor: '#E8ECF4',
    borderRadius: 12,
    marginBottom: 20,
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
  avatarText: { color: '#FFFFFF', fontSize: 22, fontWeight: '700' },
  name: { fontSize: 18, fontWeight: '700', color: '#1E232C' },
  email: { fontSize: 13, color: '#8391A1', marginTop: 2 },
  detail: { fontSize: 14, color: '#6A707C', marginTop: 8 },
  zoneRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  detailMuted: { fontSize: 14, color: '#8391A1' },
  zoneBadge: {
    backgroundColor: '#FFF1F1',
    borderRadius: 9999,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  zoneBadgeText: { fontSize: 12, fontWeight: '600', color: '#DC143C' },
  factsCard: {
    borderWidth: 1.5,
    borderColor: '#E8ECF4',
    borderRadius: 12,
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  factRow: { paddingVertical: 14 },
  factLabel: { fontSize: 12, color: '#8391A1', marginBottom: 4 },
  factValue: { fontSize: 15, fontWeight: '500', color: '#1E232C', lineHeight: 20 },
  factDivider: { height: StyleSheet.hairlineWidth, backgroundColor: '#E8ECF4' },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1.5,
    borderColor: '#E8ECF4',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
    marginBottom: 12,
  },
  actionText: { flex: 1, fontSize: 15, fontWeight: '600', color: '#1E232C' },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1E232C',
    marginTop: 16,
    marginBottom: 12,
  },
  card: {
    borderWidth: 1.5,
    borderColor: '#E8ECF4',
    borderRadius: 12,
    paddingHorizontal: 16,
    marginBottom: 24,
  },
  passRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
  },
  rowLabel: { fontSize: 15, fontWeight: '500', color: '#1E232C' },
  passLabelWrap: { flex: 1 },
  passHint: { fontSize: 12, color: '#8391A1', marginTop: 2 },
  passValue: { fontSize: 17, fontWeight: '700', color: '#DC143C' },
  logoutRow: { marginTop: 8 },
});
