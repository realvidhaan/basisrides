import React, { useEffect, useState } from 'react';
import {
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Svg, { Circle, Line } from 'react-native-svg';

interface TimePickerClockProps {
  visible: boolean;
  value: string | null; // 'HH:MM' 24-hour
  onConfirm: (value: string) => void; // returns 'HH:MM' 24-hour
  onCancel: () => void;
}

// Allowed window: 3:15 PM (15:15) .. 6:00 PM (18:00). All times are PM.
const HOURS_12 = [3, 4, 5, 6];
const MINUTES = [0, 15, 30, 45];

const CLOCK = 240;
const CENTER = CLOCK / 2;
const RADIUS = 92;

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

function minuteOptionsForHour(h12: number): number[] {
  if (h12 === 3) return [15, 30, 45]; // 3:00 is before the 3:15 minimum
  if (h12 === 6) return [0]; // 6:00 is the maximum
  return MINUTES;
}

function parseValue(value: string | null): { hour: number; minute: number } {
  if (value) {
    const [hStr, mStr] = value.split(':');
    const h24 = Number(hStr);
    const m = Number(mStr);
    const h12 = h24 - 12; // window is entirely PM
    if (HOURS_12.includes(h12) && minuteOptionsForHour(h12).includes(m)) {
      return { hour: h12, minute: m };
    }
  }
  return { hour: 3, minute: 15 };
}

// Position on the clock face for a given "12-step" index (0..11), measured
// clockwise from the top.
function pointForIndex(index: number): { x: number; y: number } {
  const angle = (index * 30 * Math.PI) / 180;
  return {
    x: CENTER + RADIUS * Math.sin(angle),
    y: CENTER - RADIUS * Math.cos(angle),
  };
}

export function TimePickerClock({
  visible,
  value,
  onConfirm,
  onCancel,
}: TimePickerClockProps) {
  const [hour, setHour] = useState<number>(3);
  const [minute, setMinute] = useState<number>(15);
  const [mode, setMode] = useState<'hour' | 'minute'>('hour');

  // Re-seed each time the picker opens.
  useEffect(() => {
    if (visible) {
      const parsed = parseValue(value);
      setHour(parsed.hour);
      setMinute(parsed.minute);
      setMode('hour');
    }
  }, [visible, value]);

  function selectHour(h: number): void {
    setHour(h);
    const opts = minuteOptionsForHour(h);
    if (!opts.includes(minute)) setMinute(opts[0]);
    setMode('minute');
  }

  function selectMinute(m: number): void {
    if (minuteOptionsForHour(hour).includes(m)) setMinute(m);
  }

  function handleOk(): void {
    onConfirm(`${pad2(hour + 12)}:${pad2(minute)}`);
  }

  // Hand points at whichever field is being edited.
  const handIndex = mode === 'hour' ? hour % 12 : minute / 5;
  const handPoint = pointForIndex(handIndex);

  const numbers =
    mode === 'hour'
      ? Array.from({ length: 12 }, (_, i) => {
          const label = i === 0 ? 12 : i;
          return {
            index: i,
            label,
            enabled: HOURS_12.includes(label),
            selected: label === hour,
            onPress: () => selectHour(label),
          };
        })
      : Array.from({ length: 12 }, (_, i) => {
          const m = i * 5;
          return {
            index: i,
            label: pad2(m),
            enabled: minuteOptionsForHour(hour).includes(m),
            selected: m === minute,
            onPress: () => selectMinute(m),
          };
        });

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.heading}>SELECT TIME</Text>

          {/* Digital readout */}
          <View style={styles.readout}>
            <TouchableOpacity
              style={[styles.segment, mode === 'hour' && styles.segmentActive]}
              onPress={() => setMode('hour')}
            >
              <Text
                style={[
                  styles.segmentText,
                  mode === 'hour' && styles.segmentTextActive,
                ]}
              >
                {hour}
              </Text>
            </TouchableOpacity>
            <Text style={styles.colon}>:</Text>
            <TouchableOpacity
              style={[styles.segment, mode === 'minute' && styles.segmentActive]}
              onPress={() => setMode('minute')}
            >
              <Text
                style={[
                  styles.segmentText,
                  mode === 'minute' && styles.segmentTextActive,
                ]}
              >
                {pad2(minute)}
              </Text>
            </TouchableOpacity>
            <View style={styles.pmBox}>
              <Text style={styles.pmText}>PM</Text>
            </View>
          </View>

          {/* Analog clock */}
          <View style={styles.clockWrap}>
            <Svg width={CLOCK} height={CLOCK}>
              <Circle cx={CENTER} cy={CENTER} r={CENTER} fill="#F4F4F6" />
              <Line
                x1={CENTER}
                y1={CENTER}
                x2={handPoint.x}
                y2={handPoint.y}
                stroke="#DC143C"
                strokeWidth={2}
              />
              <Circle cx={CENTER} cy={CENTER} r={4} fill="#DC143C" />
              <Circle cx={handPoint.x} cy={handPoint.y} r={18} fill="#DC143C" />
            </Svg>
            {numbers.map((n) => {
              const p = pointForIndex(n.index);
              return (
                <TouchableOpacity
                  key={n.index}
                  disabled={!n.enabled}
                  onPress={n.onPress}
                  style={[styles.number, { left: p.x - 18, top: p.y - 18 }]}
                >
                  <Text
                    style={[
                      styles.numberText,
                      n.selected ? styles.numberSelected : null,
                      !n.enabled ? styles.numberDisabled : null,
                    ]}
                  >
                    {n.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Actions */}
          <View style={styles.actions}>
            <TouchableOpacity style={styles.actionBtn} onPress={onCancel}>
              <Text style={styles.actionText}>CANCEL</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionBtn} onPress={handleOk}>
              <Text style={styles.actionText}>OK</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    width: '100%',
    maxWidth: 340,
    alignItems: 'center',
  },
  heading: {
    alignSelf: 'flex-start',
    fontSize: 12,
    fontWeight: '600',
    color: '#6A707C',
    letterSpacing: 0.5,
    marginBottom: 16,
  },
  readout: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  segment: {
    minWidth: 78,
    height: 70,
    borderRadius: 10,
    backgroundColor: '#F7F8F9',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  segmentActive: {
    backgroundColor: '#FFF1F1',
  },
  segmentText: {
    fontSize: 44,
    fontWeight: '500',
    color: '#1E232C',
  },
  segmentTextActive: {
    color: '#DC143C',
  },
  colon: {
    fontSize: 44,
    fontWeight: '500',
    color: '#1E232C',
    marginHorizontal: 6,
  },
  pmBox: {
    marginLeft: 12,
    borderWidth: 1.5,
    borderColor: '#DC143C',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#FFF1F1',
  },
  pmText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#DC143C',
  },
  clockWrap: {
    width: CLOCK,
    height: CLOCK,
    marginBottom: 12,
  },
  number: {
    position: 'absolute',
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  numberText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1E232C',
  },
  numberSelected: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  numberDisabled: {
    color: '#C9CDD4',
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignSelf: 'stretch',
    gap: 8,
    marginTop: 4,
  },
  actionBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  actionText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#DC143C',
    letterSpacing: 0.3,
  },
});
