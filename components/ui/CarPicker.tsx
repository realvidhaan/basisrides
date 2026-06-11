import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Input } from '@/components/ui/Input';
import { CarIllustration } from '@/components/CarIllustration';
import {
  CAR_COLORS,
  CAR_TYPES,
  type CarColorKey,
  type CarTypeKey,
} from '@/lib/carOptions';

export interface CarPickerValues {
  colorKey: CarColorKey;
  type: CarTypeKey;
  model: string;
  plate: string;
}

interface Props {
  values: CarPickerValues;
  onChange: (next: CarPickerValues) => void;
  modelError?: string;
  plateError?: string;
}

/**
 * Vehicle editor shared by signup and Edit information. Shows a live preview of
 * the car that updates as the parent picks a color and body type, plus text
 * fields for the make/model and license plate. Fully controlled.
 */
export function CarPicker({ values, onChange, modelError, plateError }: Props) {
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

      <Input
        label="Make & model"
        value={values.model}
        onChangeText={(t) => set('model', t)}
        placeholder="Honda Odyssey"
        error={modelError}
        autoCapitalize="words"
      />

      <Input
        label="License plate"
        value={values.plate}
        onChangeText={(t) => set('plate', t)}
        placeholder="7ABC123"
        autoCapitalize="characters"
        autoCorrect={false}
        error={plateError}
      />
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
