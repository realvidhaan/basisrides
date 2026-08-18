import React, { useEffect, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { colors } from '@/constants/theme/colors';
import { typography } from '@/constants/theme/typography';

type LogoSize = 'welcome' | 'header';
type LogoLayout = 'stacked' | 'inline';

interface LogoProps {
  size?: LogoSize;
  showWordmark?: boolean;
  layout?: LogoLayout;
}

// 'header' is sized for a compact row alongside other controls (e.g. the
// Schedule screen's header, which also carries icon buttons and a text
// link) — the design handoff's 56px standalone-screen size would grow that
// row well past a text wordmark's line height.
const MARK_SIZE: Record<LogoSize, number> = { welcome: 92, header: 28 };

export function Logo({ size = 'welcome', showWordmark = true, layout = 'stacked' }: LogoProps) {
  const markSize = MARK_SIZE[size];
  // The wordmark carries the "Ridr" label when it's shown, so the mark
  // itself must stay silent to VoiceOver/TalkBack — otherwise the two sit
  // side by side and get announced as "Ridr, Ridr". When the wordmark is
  // hidden (e.g. a cramped header row), the mark becomes the only element
  // and has to speak for itself instead.
  const markIsAccessible = !showWordmark;

  // On iOS, App.tsx's useFonts() resolving `true` doesn't guarantee CoreText
  // can measure Sora_800ExtraBold correctly yet — the very first Text laid
  // out with it can still clip the last glyph (confirmed on-device across
  // repeated cold launches: "ridr" -> "rid", even with the padding fix
  // above, which only reduces how often it happens). Forcing one extra
  // remount two frames after mount gives CoreText time to catch up, and a
  // fresh Yoga layout pass then measures correctly.
  const [remeasureKey, setRemeasureKey] = useState(0);
  useEffect(() => {
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setRemeasureKey((k) => k + 1));
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, []);

  return (
    <View style={layout === 'stacked' ? styles.stacked : styles.inline}>
      <Image
        source={require('../../assets/logo-mark.png')}
        style={{ width: markSize, height: markSize }}
        resizeMode="contain"
        accessibilityElementsHidden={!markIsAccessible}
        importantForAccessibility={markIsAccessible ? 'yes' : 'no'}
        accessibilityRole={markIsAccessible ? 'image' : undefined}
        accessibilityLabel={markIsAccessible ? 'Ridr' : undefined}
      />
      {showWordmark && (
        <Text
          key={remeasureKey}
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
    // Sora ExtraBold's glyphs visually overhang their measured advance
    // width enough that Yoga's tight intrinsic-width sizing clips the
    // last character on iOS (confirmed on-device: "ridr" rendered as
    // "rid"). Symmetric padding (not paddingRight alone) fixes the clip
    // without shifting the wordmark off-center under the mark image in
    // the stacked layout (Welcome/splash), which has no matching padding.
    paddingHorizontal: 4,
  },
  wordmarkInline: { marginTop: 0 },
});
