import React, { useCallback, useEffect, useState } from 'react';
import * as Sentry from '@sentry/react-native';
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
import * as Clipboard from 'expo-clipboard';
import type { StackNavigationProp } from '@react-navigation/stack';
import type { Invite, ProfileStackParamList } from '@/types';
import { BackButton } from '@/components/ui/BackButton';
import { Button } from '@/components/ui/Button';
import { ErrorMessage } from '@/components/ui/ErrorMessage';
import { supabase } from '@/lib/supabase';
import { useCurrentUser } from '@/hooks/useCurrentUser';

type Nav = StackNavigationProp<ProfileStackParamList, 'Invite'>;

interface Props {
  navigation: Nav;
}

// Unambiguous alphabet (no O/0/I/1) for codes parents read aloud.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function genCode(): string {
  let s = '';
  for (let i = 0; i < 6; i += 1) {
    s += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return s;
}

function inviteMessage(code: string): string {
  return (
    `Join me on BasisRide — the carpool app for BISV families. ` +
    `Sign up and enter invite code ${code} to get started.`
  );
}

export function InviteScreen({ navigation }: Props) {
  const { user } = useCurrentUser();
  const [invites, setInvites] = useState<Invite[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const fetchInvites = useCallback(async (): Promise<void> => {
    if (!user) return;
    try {
      const { data, error: fErr } = await supabase
        .from('invites')
        .select('*')
        .eq('inviter_id', user.id)
        .order('created_at', { ascending: false });
      if (fErr) {
        setError('Could not load your invites. Please try again.');
        return;
      }
      setInvites((data ?? []) as Invite[]);
      setError(null);
    } catch {
      setError('Could not load your invites. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void fetchInvites();
  }, [fetchInvites]);

  async function createInvite(): Promise<void> {
    if (!user || creating) return;
    setCreating(true);
    setError(null);
    try {
      // Retry once on the rare code collision (PK conflict).
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const code = genCode();
        const { error: iErr } = await supabase
          .from('invites')
          .insert({ code, inviter_id: user.id });
        if (!iErr) {
          await fetchInvites();
          setCreating(false);
          return;
        }
        Sentry.captureException(iErr);
        if (!/duplicate|unique/i.test(iErr.message)) break;
      }
      setError('Could not create an invite. Please try again.');
    } catch (e) {
      Sentry.captureException(e);
      setError('Could not create an invite. Please try again.');
    } finally {
      setCreating(false);
    }
  }

  async function copy(code: string): Promise<void> {
    try {
      await Clipboard.setStringAsync(inviteMessage(code));
      setCopied(code);
      setTimeout(() => setCopied((c) => (c === code ? null : c)), 1800);
    } catch {
      setError('Could not copy. Please try again.');
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <BackButton onPress={() => navigation.goBack()} />
        <Text style={styles.title}>Invite parents</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {error ? <ErrorMessage message={error} /> : null}

        <Text style={styles.intro}>
          BasisRide works best when your whole carpool circle is on it. Generate
          an invite code and share it with another BISV parent — when they sign
          up with it, you&apos;ll get a heads-up.
        </Text>

        <View style={styles.createRow}>
          <Button
            title="Create an invite code"
            onPress={() => void createInvite()}
            loading={creating}
          />
        </View>

        {loading ? (
          <View style={styles.loadingArea}>
            <ActivityIndicator color="#DC143C" size="large" />
          </View>
        ) : invites.length === 0 ? (
          <Text style={styles.empty}>No invite codes yet.</Text>
        ) : (
          invites.map((inv) => (
            <View key={inv.code} style={styles.inviteCard}>
              <View style={styles.inviteTop}>
                <Text style={styles.code}>{inv.code}</Text>
                <View
                  style={[
                    styles.badge,
                    inv.accepted_by ? styles.badgeUsed : styles.badgeOpen,
                  ]}
                >
                  <Text
                    style={[
                      styles.badgeText,
                      inv.accepted_by
                        ? styles.badgeTextUsed
                        : styles.badgeTextOpen,
                    ]}
                  >
                    {inv.accepted_by ? 'Used' : 'Open'}
                  </Text>
                </View>
              </View>
              {!inv.accepted_by ? (
                <TouchableOpacity
                  style={styles.copyBtn}
                  onPress={() => void copy(inv.code)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.copyText}>
                    {copied === inv.code ? 'Copied!' : 'Copy invite message'}
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ))
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
  scrollContent: { padding: 24, paddingBottom: 40 },
  intro: { fontSize: 14, color: '#6A707C', lineHeight: 20, marginBottom: 16 },
  createRow: { marginBottom: 24 },
  loadingArea: { paddingVertical: 24, alignItems: 'center' },
  empty: { fontSize: 14, color: '#8391A1', textAlign: 'center' },
  inviteCard: {
    borderWidth: 1.5,
    borderColor: '#E8ECF4',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  inviteTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  code: {
    fontSize: 22,
    fontWeight: '800',
    color: '#1E232C',
    letterSpacing: 3,
  },
  badge: { borderRadius: 9999, paddingHorizontal: 10, paddingVertical: 3 },
  badgeOpen: { backgroundColor: '#FFF1F1' },
  badgeUsed: { backgroundColor: '#F0FDF4' },
  badgeText: { fontSize: 12, fontWeight: '700' },
  badgeTextOpen: { color: '#DC143C' },
  badgeTextUsed: { color: '#16A34A' },
  copyBtn: {
    marginTop: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#DC143C',
    alignItems: 'center',
  },
  copyText: { fontSize: 14, fontWeight: '700', color: '#DC143C' },
});
