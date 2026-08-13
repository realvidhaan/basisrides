import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { ImpactTotals } from '@/lib/impact';

interface Props {
  totals: ImpactTotals;
}

/**
 * Thousands separators without Intl. Hermes ships a partial Intl and
 * `toLocaleString` has bitten this codebase's target platforms before; the app
 * is en-US only, so a regex is the cheaper certainty.
 */
function group(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * One decimal below ten, whole numbers above. "6.4 mi" is a real week of
 * carpooling; "6 mi" throws away a sixth of it. Past ten the decimal is noise.
 */
function magnitude(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0';
  if (n < 10) return n.toFixed(1);
  return group(Math.round(n));
}

function Metric({
  value,
  unit,
  label,
}: {
  value: string;
  unit?: string;
  label: string;
}) {
  return (
    <View style={styles.metric}>
      {/* maxFontSizeMultiplier keeps three columns side by side at the largest
          Dynamic Type settings. The strip is ambient context, so capping its
          growth is a fairer trade than letting it push the calendar off screen;
          the numbers still scale, just not without bound. */}
      <Text style={styles.value} numberOfLines={1} maxFontSizeMultiplier={1.5}>
        {value}
        {unit ? <Text style={styles.unit}> {unit}</Text> : null}
      </Text>
      <Text style={styles.label} numberOfLines={1} maxFontSizeMultiplier={1.3}>
        {label}
      </Text>
    </View>
  );
}

/**
 * What this family's carpooling has added up to, in one line above the
 * calendar.
 *
 * Green, not crimson: BasisRide already speaks green for "this went well" (the
 * arrival banner and the "you're being picked up" status both use #16A34A /
 * #EAF7EE), and this strip reports exactly that — completed rides. It stays a
 * pale tint field with deep-green type rather than a saturated block, so a
 * near-complementary hue never competes with the crimson wordmark a few
 * points above it.
 *
 * Renders nothing until the first ride is shared. A row of zeros on a new
 * account is a promise the app hasn't kept yet, and it would push the calendar
 * — the thing a first-run parent came for — further down the screen. Once
 * there is history the strip is permanent, including a legitimate 0 miles when
 * riders have no saved coordinates.
 */
export function ImpactStrip({ totals }: Props) {
  if (totals.ridesShared <= 0) return null;

  const miles = magnitude(totals.milesSaved);
  const co2 = magnitude(totals.co2KgAvoided);
  const rides = group(totals.ridesShared);

  return (
    <View
      style={styles.strip}
      // Grouped, or VoiceOver reads six disconnected fragments. The label spells
      // out the units the visual design abbreviates.
      accessible
      accessibilityLabel={
        `Your carpool impact so far: ${miles} miles saved, ` +
        `${co2} kilograms of carbon dioxide avoided, ` +
        `${totals.ridesShared} ${totals.ridesShared === 1 ? 'ride' : 'rides'} shared.`
      }
    >
      <Metric value={miles} unit="mi" label="Miles saved" />
      <View style={styles.divider} />
      <Metric value={co2} unit="kg" label="CO₂ avoided" />
      <View style={styles.divider} />
      <Metric value={rides} label="Rides shared" />
    </View>
  );
}

const styles = StyleSheet.create({
  strip: {
    flexDirection: 'row',
    alignItems: 'center',
    // Low and wide: a strip, not a card. It reads in one glance on the way to
    // the calendar and never earns a second look.
    paddingVertical: 10,
    paddingHorizontal: 8,
    marginBottom: 12,
    borderRadius: 12,
    backgroundColor: '#EAF7EE',
    borderWidth: 1,
    borderColor: '#CFE7D8',
  },
  metric: { flex: 1, alignItems: 'center' },
  divider: { width: 1, alignSelf: 'stretch', backgroundColor: '#CFE7D8' },
  // 4.55:1 on the tint. Same green the arrival banner uses for "done".
  value: { fontSize: 17, fontWeight: '700', color: '#15803D' },
  unit: { fontSize: 12, fontWeight: '600', color: '#15803D' },
  // Tinted from the strip's own hue rather than grey — grey on a colour field
  // reads as dirty. 5.1:1 on the tint.
  label: {
    fontSize: 11,
    fontWeight: '600',
    color: '#4A6F58',
    marginTop: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
});
