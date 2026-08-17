import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { formatMonthYear } from '@/lib/dateUtils';
import type { DayWidget } from '@/types';
import { colors } from '@/constants/theme/colors';

interface CalendarPickerProps {
  selected: Date;
  onSelect: (date: Date) => void;
  /** Optional per-day widget (carpool status / no-school label). */
  dayInfo?: (date: Date) => DayWidget;
}

const WEEKDAY_HEADERS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function buildGrid(viewYear: number, viewMonth: number): Date[] {
  const first = new Date(viewYear, viewMonth, 1);
  const jsDay = first.getDay();
  const offset = (jsDay + 6) % 7; // Monday-first
  const start = new Date(viewYear, viewMonth, 1 - offset);
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

function Chip({ info }: { info: DayWidget }) {
  if (info.kind === 'drive' || info.kind === 'ride') {
    const drive = info.kind === 'drive';
    return (
      <View style={[styles.chip, drive ? styles.chipDrive : styles.chipRide]}>
        <Text style={styles.chipText} numberOfLines={1}>
          {drive ? '🚗' : '🧍'} {info.time}
        </Text>
      </View>
    );
  }
  if (info.kind === 'unmatched') {
    return (
      <View style={[styles.chip, styles.chipUnmatched]}>
        <Text style={[styles.chipText, styles.chipTextUnmatched]}>no car</Text>
      </View>
    );
  }
  if (info.kind === 'blocked' && info.label) {
    return (
      <Text style={styles.blockedLabel} numberOfLines={1}>
        {info.label}
      </Text>
    );
  }
  return null;
}

/**
 * Material-style month calendar (Monday-first) in the Ridr brand, with an
 * optional per-day status widget (Drive/Pickup chip, or a no-school label).
 */
export function CalendarPicker({ selected, onSelect, dayInfo }: CalendarPickerProps) {
  const [view, setView] = useState<{ year: number; month: number }>(() => ({
    year: selected.getFullYear(),
    month: selected.getMonth(),
  }));

  const today = new Date();
  const cells = buildGrid(view.year, view.month);

  function shiftMonth(delta: number): void {
    setView((prev) => {
      const d = new Date(prev.year, prev.month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  }

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.navButton}
          onPress={() => shiftMonth(-1)}
          accessibilityLabel="Previous month"
        >
          <Text style={styles.navChevron}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.monthLabel}>
          {formatMonthYear(new Date(view.year, view.month, 1))}
        </Text>
        <TouchableOpacity
          style={styles.navButton}
          onPress={() => shiftMonth(1)}
          accessibilityLabel="Next month"
        >
          <Text style={styles.navChevron}>›</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.weekRow}>
        {WEEKDAY_HEADERS.map((w) => (
          <View key={w} style={styles.headerCell}>
            <Text style={styles.weekdayText}>{w}</Text>
          </View>
        ))}
      </View>

      {Array.from({ length: 6 }, (_, row) => (
        <View key={row} style={styles.weekRow}>
          {cells.slice(row * 7, row * 7 + 7).map((d) => {
            const inMonth = d.getMonth() === view.month;
            const isSelected = sameDay(d, selected);
            const isToday = sameDay(d, today);
            const info = dayInfo ? dayInfo(d) : undefined;
            const blocked = info?.kind === 'blocked';
            return (
              <TouchableOpacity
                key={d.toISOString()}
                style={[styles.cell, isSelected ? styles.cellSelected : null]}
                onPress={() => onSelect(d)}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.dayText,
                    !inMonth || blocked ? styles.dayMuted : null,
                    isToday ? styles.dayToday : null,
                    isSelected ? styles.daySelectedText : null,
                  ]}
                >
                  {d.getDate()}
                </Text>
                {info ? <Chip info={info} /> : null}
              </TouchableOpacity>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surfaceWhite,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: colors.borderSubtle,
    padding: 10,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  navButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceSubtle,
  },
  navChevron: {
    fontSize: 24,
    lineHeight: 26,
    color: colors.ink,
  },
  monthLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.ink,
  },
  weekRow: {
    flexDirection: 'row',
  },
  headerCell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 4,
  },
  weekdayText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textMuted,
  },
  cell: {
    flex: 1,
    height: 54,
    borderRadius: 8,
    paddingTop: 4,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  cellSelected: {
    borderColor: colors.brandTeal,
    backgroundColor: '#FFF7F8',
  },
  dayText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.ink,
  },
  dayMuted: {
    color: '#C9CDD4',
  },
  dayToday: {
    color: colors.brandTeal,
    fontWeight: '800',
  },
  daySelectedText: {
    color: colors.brandTeal,
  },
  chip: {
    marginTop: 3,
    borderRadius: 5,
    paddingHorizontal: 3,
    paddingVertical: 1,
    maxWidth: '96%',
  },
  chipDrive: {
    backgroundColor: colors.brandTeal,
  },
  chipRide: {
    backgroundColor: colors.success,
  },
  chipUnmatched: {
    backgroundColor: '#FEF3C7',
  },
  chipText: {
    fontSize: 9,
    fontWeight: '800',
    color: colors.surfaceWhite,
  },
  chipTextUnmatched: {
    color: '#B45309',
  },
  blockedLabel: {
    marginTop: 3,
    fontSize: 8,
    fontWeight: '600',
    color: colors.textDisabled,
  },
});
