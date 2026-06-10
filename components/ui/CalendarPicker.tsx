import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { formatMonthYear } from '@/lib/dateUtils';

interface CalendarPickerProps {
  selected: Date;
  onSelect: (date: Date) => void;
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
  const jsDay = first.getDay(); // 0 = Sun
  const offset = (jsDay + 6) % 7; // Monday-first: Mon -> 0
  const start = new Date(viewYear, viewMonth, 1 - offset);
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

/**
 * Material-style month calendar (Monday-first) recreated in the BasisRide brand.
 * Selected day = filled crimson square; today = crimson ring; other-month = muted.
 */
export function CalendarPicker({ selected, onSelect }: CalendarPickerProps) {
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
          <View key={w} style={styles.cell}>
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
            return (
              <TouchableOpacity
                key={d.toISOString()}
                style={styles.cell}
                onPress={() => onSelect(d)}
                activeOpacity={0.7}
              >
                <View
                  style={[
                    styles.dayPill,
                    isToday && !isSelected ? styles.dayToday : null,
                    isSelected ? styles.daySelected : null,
                  ]}
                >
                  <Text
                    style={[
                      styles.dayText,
                      !inMonth ? styles.dayMuted : null,
                      isSelected ? styles.daySelectedText : null,
                    ]}
                  >
                    {d.getDate()}
                  </Text>
                </View>
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
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#E8ECF4',
    padding: 12,
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
    backgroundColor: '#F7F8F9',
  },
  navChevron: {
    fontSize: 24,
    lineHeight: 26,
    color: '#1E232C',
  },
  monthLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1E232C',
  },
  weekRow: {
    flexDirection: 'row',
  },
  cell: {
    flex: 1,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekdayText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#8391A1',
  },
  dayPill: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayToday: {
    borderWidth: 1.5,
    borderColor: '#DC143C',
  },
  daySelected: {
    backgroundColor: '#DC143C',
  },
  dayText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1E232C',
  },
  dayMuted: {
    color: '#C9CDD4',
  },
  daySelectedText: {
    color: '#FFFFFF',
  },
});
