import React from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { Ionicons } from '@expo/vector-icons';
import { Input } from '@/components/ui/Input';
import { CarIllustration } from '@/components/CarIllustration';
import {
  CAR_COLORS,
  CAR_TYPES,
  type CarColorKey,
  type CarTypeKey,
} from '@/lib/carOptions';
import { US_STATES, normalizePlate, plateMaxFor } from '@/lib/licensePlate';

export interface CarPickerValues {
  colorKey: CarColorKey;
  type: CarTypeKey;
  state: string;
  plate: string;
}

interface Props {
  values: CarPickerValues;
  onChange: (next: CarPickerValues) => void;
  stateError?: string;
  plateError?: string;
}

/**
 * Vehicle editor used at signup. Shows a live preview of the car that updates as
 * the parent picks a color and body type, plus the registration state + license
 * plate fields. The plate is uppercased as you type and validated against the
 * selected state's structural rules (see lib/licensePlate). Fully controlled.
 */
export function CarPicker({ values, onChange, stateError, plateError }: Props) {
  function set<K extends keyof CarPickerValues>(
    key: K,
    value: CarPickerValues[K],
  ): void {
    onChange({ ...values, [key]: value });
  }

  return (
    <View>
      <View style={styles.preview}>
        <CarIllustration colorKey={values.colorKey} type={values.type} size={150} />
      </View>

      <Text style={styles.fieldLabel}>Color</Text>
      <View style={styles.swatchRow}>
        {CAR_COLORS.map((c) => {
          const active = c.key === values.colorKey;
          return (
            <TouchableOpacity
              key={c.key}
              onPress={() => set('colorKey', c.key)}
              activeOpacity={0.8}
              accessibilityLabel={`${c.label} car`}
              style={[
                styles.swatch,
                { backgroundColor: c.base },
                active && styles.swatchActive,
              ]}
            >
              {active ? (
                <Ionicons
                  name="checkmark"
                  size={16}
                  color={c.key === 'white' ? '#1E232C' : '#FFFFFF'}
                />
              ) : null}
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={styles.fieldLabel}>Body type</Text>
      <View style={styles.segment}>
        {CAR_TYPES.map((t) => {
          const active = t.key === values.type;
          return (
            <TouchableOpacity
              key={t.key}
              onPress={() => set('type', t.key)}
              activeOpacity={0.8}
              style={[styles.segmentItem, active && styles.segmentItemActive]}
            >
              <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
                {t.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={styles.fieldLabel}>Plate state</Text>
      <View
        style={[
          styles.pickerContainer,
          stateError ? styles.pickerContainerError : null,
        ]}
      >
        <Picker<string>
          selectedValue={values.state}
          onValueChange={(val) => set('state', val)}
          style={styles.picker}
          itemStyle={styles.pickerItem}
        >
          <Picker.Item label="Select state" value="" color="#A0A0A0" />
          {US_STATES.map((s) => (
            <Picker.Item key={s.code} label={s.name} value={s.code} />
          ))}
        </Picker>
      </View>
      {stateError ? <Text style={styles.fieldError}>{stateError}</Text> : null}

      <Input
        label="License plate"
        value={values.plate}
        onChangeText={(t) => set('plate', normalizePlate(t))}
        placeholder="7ABC123"
        autoCapitalize="characters"
        autoCorrect={false}
        error={plateError}
      />
      <Text style={styles.plateHint}>
        {values.state
          ? `Up to ${plateMaxFor(values.state)} letters/numbers. Vanity plates are fine.`
          : 'Pick your state first, then enter the plate exactly as printed.'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  preview: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    marginBottom: 12,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: '#0A0A0A',
    marginBottom: 8,
  },
  pickerContainer: {
    borderWidth: 1.5,
    borderColor: '#E0E0E0',
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
    height: Platform.OS === 'ios' ? 160 : 52,
    justifyContent: 'center',
    marginBottom: 16,
  },
  pickerContainerError: { borderColor: '#DC143C', marginBottom: 4 },
  picker: { color: '#0A0A0A' },
  pickerItem: { fontSize: 15, color: '#0A0A0A' },
  fieldError: { fontSize: 12, color: '#DC143C', marginTop: 4, marginBottom: 12 },
  plateHint: { fontSize: 12, color: '#6B6B6B', marginTop: 6 },
  swatchRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 20,
  },
  swatch: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#E0E0E0',
  },
  swatchActive: {
    borderColor: '#0A0A0A',
    borderWidth: 2.5,
  },
  segment: {
    flexDirection: 'row',
    backgroundColor: '#F1F2F4',
    borderRadius: 10,
    padding: 4,
    marginBottom: 20,
  },
  segmentItem: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  segmentItemActive: {
    backgroundColor: '#FFFFFF',
  },
  segmentText: { fontSize: 14, fontWeight: '500', color: '#6A707C' },
  segmentTextActive: { color: '#0A0A0A' },
});
