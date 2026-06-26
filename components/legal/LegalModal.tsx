import React from 'react';
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

/**
 * In-app Terms / Privacy as a native iOS page-sheet (slides up, swipe to
 * dismiss). Apple still requires a Privacy Policy *URL* in App Store Connect
 * (served by the `legal` Edge Function), but the in-app consent links open this
 * instead of a browser. Content mirrors /legal/*.md and the legal Edge Function.
 */

export type LegalDoc = 'terms' | 'privacy';

interface Section {
  heading?: string;
  body?: string;
  bullets?: string[];
}

const UPDATED = 'June 25, 2026';

const TITLES: Record<LegalDoc, string> = {
  terms: 'Terms of Service',
  privacy: 'Privacy Policy',
};

const PRIVACY: Section[] = [
  {
    body: 'BasisRide ("we", "us") helps verified families at Basis Independent Silicon Valley (BISV) coordinate carpools. By creating an account you agree to this policy.',
  },
  {
    heading: 'Who uses BasisRide',
    body: 'Accounts are created and used by parents and guardians (adults). It is not for use by children directly. Parents provide limited information about their child for carpool coordination.',
  },
  {
    heading: 'Information we collect',
    bullets: [
      'Account & contact: parent/guardian name, email, password (stored hashed).',
      "Child information (provided by the parent): child's name and grade — used only to identify riders in your carpool.",
      'Home location: your home address and approximate coordinates, to set pickup/drop-off and match nearby families.',
      'Vehicle (drivers only): car color, type, and license plate, so riders can identify the vehicle.',
      "Trip location (active trips only): while a driver has a trip in progress, their device location is shared in real time with that trip's riders' parents. This live location is not stored.",
      'Messages you send to other carpool members.',
      'Device & diagnostics: a push token, and crash/error diagnostics (via Sentry).',
    ],
  },
  {
    heading: 'How we use it',
    body: 'To create and verify your account (invited BISV families only), match carpools, coordinate schedules and pickups, deliver notifications, investigate abuse reports, and improve reliability. We do not sell your information and do not use it for advertising.',
  },
  {
    heading: 'Who can see your information',
    body: "Other parents in your carpool can see your name, your child's name and grade, your pickup area, your vehicle details (if you drive), and messages you send them. Service providers (Supabase for backend/auth, Sentry for error monitoring) process data on our behalf. We may disclose information if required by law or to protect someone's safety.",
  },
  {
    heading: 'Retention & deletion',
    body: 'We keep your information while your account is active. You can delete your account at any time in the app (Profile → Delete account), which permanently removes your profile and associated data, or email us to request deletion.',
  },
  {
    heading: "Children's privacy",
    body: 'BasisRide is for parents/guardians, who provide limited child information solely for carpool coordination. We do not knowingly allow children to create accounts.',
  },
  {
    heading: 'Security',
    body: 'Data is encrypted in transit and access is restricted to authenticated, invited BISV families via database access controls.',
  },
  { heading: 'Contact', body: 'support@basisride.app' },
];

const TERMS: Section[] = [
  {
    heading: '1. What BasisRide is',
    body: 'BasisRide is a coordination tool for verified BISV families to arrange carpools among themselves. BasisRide is not a transportation provider, rideshare company, or carrier. We do not provide transportation, employ or contract drivers, vet or background-check drivers or riders, or supervise any trip. All carpools are arranged and carried out by parents/guardians at their own discretion and risk.',
  },
  {
    heading: '2. Eligibility',
    body: 'You must be a parent or legal guardian of a BISV student and have a valid invite code from BISV or another BISV family. Accounts are for adults.',
  },
  {
    heading: '3. Your responsibilities',
    bullets: [
      'Provide accurate information about yourself and your child.',
      'If you drive: hold a valid license and current auto insurance, keep your vehicle legal and roadworthy, and comply with all traffic and child-passenger-safety laws (including car-seat/booster requirements).',
      'Decide for yourself whether to offer or accept any ride; you are responsible for the safety of any trip you join.',
      'Treat other members respectfully and post no abusive or objectionable content.',
    ],
  },
  {
    heading: '4. Safety & no vetting',
    body: 'We do not perform background checks and do not verify driving records, insurance, or vehicle condition. You are responsible for satisfying yourself about any driver before entrusting your child to a carpool. Invite-only access limits the community to BISV families but is not a guarantee of any individual’s trustworthiness.',
  },
  {
    heading: '5. Content & conduct',
    body: 'You are responsible for the content you share. Abusive, harassing, or objectionable content is prohibited. You can report content and block users in the app. We may review reports and remove content or suspend accounts, typically within 24 hours of a report.',
  },
  {
    heading: '6. Assumption of risk; limitation of liability',
    body: 'To the fullest extent permitted by law, you participate in carpools at your own risk. BasisRide and its creators are not liable for any injury, loss, damage, or dispute arising from any carpool, ride, driver, rider, or interaction arranged through the app. BasisRide is provided "as is" without warranties. Our total liability is limited to the amount you paid us (which is $0 for a free app).',
  },
  {
    heading: '7. Indemnification',
    body: 'You agree to indemnify and hold harmless BasisRide and its creators from claims arising out of your use of the app, your carpools, or your violation of these terms.',
  },
  {
    heading: '8. Termination',
    body: 'You may delete your account at any time (Profile → Delete account). We may suspend or terminate accounts that violate these terms.',
  },
  {
    heading: '9. Changes',
    body: 'We may update these terms; continued use after an update means you accept the revised terms.',
  },
  { heading: '10. Contact', body: 'support@basisride.app' },
];

const CONTENT: Record<LegalDoc, Section[]> = { terms: TERMS, privacy: PRIVACY };

interface Props {
  visible: boolean;
  doc: LegalDoc;
  onClose: () => void;
}

export function LegalModal({ visible, doc, onClose }: Props) {
  const sections = CONTENT[doc];
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <Text style={styles.title}>{TITLES[doc]}</Text>
          <TouchableOpacity
            onPress={onClose}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityRole="button"
            accessibilityLabel="Close"
          >
            <Text style={styles.done}>Done</Text>
          </TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
          <Text style={styles.updated}>Last updated: {UPDATED}</Text>
          {sections.map((s, i) => (
            <View key={i} style={styles.section}>
              {s.heading ? <Text style={styles.h2}>{s.heading}</Text> : null}
              {s.body ? <Text style={styles.p}>{s.body}</Text> : null}
              {s.bullets?.map((b, j) => (
                <View key={j} style={styles.bulletRow}>
                  <Text style={styles.bulletDot}>{'•'}</Text>
                  <Text style={styles.bulletText}>{b}</Text>
                </View>
              ))}
            </View>
          ))}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E0E0E0',
  },
  title: { fontSize: 18, fontWeight: '700', color: '#1E232C' },
  done: { fontSize: 16, fontWeight: '600', color: '#DC143C' },
  body: { padding: 24, paddingBottom: 48 },
  updated: { fontSize: 13, color: '#8391A1', marginBottom: 16 },
  section: { marginBottom: 4 },
  h2: { fontSize: 16, fontWeight: '700', color: '#1E232C', marginTop: 20, marginBottom: 6 },
  p: { fontSize: 14, color: '#3A4150', lineHeight: 21 },
  bulletRow: { flexDirection: 'row', gap: 8, marginTop: 6 },
  bulletDot: { fontSize: 14, color: '#8391A1', lineHeight: 21 },
  bulletText: { flex: 1, fontSize: 14, color: '#3A4150', lineHeight: 21 },
});
