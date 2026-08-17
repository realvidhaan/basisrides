import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { colors } from '@/constants/theme/colors';
import { typography } from '@/constants/theme/typography';

type LogoSize = 'welcome' | 'home';
type LogoLayout = 'stacked' | 'inline';

interface LogoProps {
  size?: LogoSize;
  showWordmark?: boolean;
  layout?: LogoLayout;
}

const MARK_SIZE: Record<LogoSize, number> = { welcome: 92, home: 56 };

export function Logo({ size = 'welcome', showWordmark = true, layout = 'stacked' }: LogoProps) {
  const markSize = MARK_SIZE[size];
  return (
    <View style={layout === 'stacked' ? styles.stacked : styles.inline}>
      <Image
        source={require('../../assets/logo-mark.png')}
        style={{ width: markSize, height: markSize }}
        resizeMode="contain"
        accessibilityElementsHidden
        importantForAccessibility="no"
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
