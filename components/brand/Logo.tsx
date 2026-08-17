import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { colors } from '@/constants/theme/colors';
import { typography } from '@/constants/theme/typography';

type LogoSize = 'welcome' | 'home' | 'header';
type LogoLayout = 'stacked' | 'inline';

interface LogoProps {
  size?: LogoSize;
  showWordmark?: boolean;
  layout?: LogoLayout;
}

// 'header' is sized for a compact row alongside other controls (e.g. the
// Schedule screen's header, which also carries icon buttons and a text
// link) — 'home' (56px) is the design handoff's standalone-screen size and
// would grow that row well past a text wordmark's line height.
const MARK_SIZE: Record<LogoSize, number> = { welcome: 92, home: 56, header: 28 };

export function Logo({ size = 'welcome', showWordmark = true, layout = 'stacked' }: LogoProps) {
  const markSize = MARK_SIZE[size];
  return (
    <View style={layout === 'stacked' ? styles.stacked : styles.inline}>
      <Image
        source={require('../../assets/logo-mark.png')}
        style={{ width: markSize, height: markSize }}
        resizeMode="contain"
        // The wordmark carries the "Ridr" label when it's shown, so the mark
        // itself must stay silent to VoiceOver/TalkBack — otherwise the two
        // sit side by side and get announced as "Ridr, Ridr". When the
        // wordmark is hidden (e.g. a cramped header row), the mark becomes
        // the only element and has to speak for itself instead.
        accessibilityElementsHidden={showWordmark}
        importantForAccessibility={showWordmark ? 'no' : 'yes'}
        accessibilityRole={showWordmark ? undefined : 'image'}
        accessibilityLabel={showWordmark ? undefined : 'Ridr'}
      />
      {showWordmark && (
        <Text
          style={[styles.wordmark, layout === 'inline' && styles.wordmarkInline]}
          accessibilityRole="header"
          accessibilityLabel="Ridr"
        >
          ridr
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  stacked: { alignItems: 'center' },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  wordmark: {
    fontFamily: typography.fontHeadingExtrabold as string,
    fontSize: 30,
    color: colors.ink,
    marginTop: 8,
  },
  wordmarkInline: { marginTop: 0 },
});
