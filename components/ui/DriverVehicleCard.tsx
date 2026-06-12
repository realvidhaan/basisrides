import React from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { CarIllustration } from '@/components/CarIllustration';
import { carColor, carType, carColorLabel, carTypeLabel } from '@/lib/carOptions';

interface Vehicle {
  color: string | null;
  type: string | null;
  model: string | null;
  plate: string | null;
}

interface Props {
  driverName: string;
  car: Vehicle;
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}

/**
 * The driver's vehicle as shown to a waiting rider on the live-trip screen, so a
 * parent or child at the curb can spot the right car. Leads with the painted car
 * illustration + a plain-language descriptor, then a large, high-contrast
 * license-plate chip styled like a real plate for at-a-glance scanning.
 */
export function DriverVehicleCard({ driverName, car }: Props) {
  const colorKey = carColor(car.color).key;
  const typeKey = carType(car.type);
  const descriptor =
    car.model && car.model.trim()
      ? car.model.trim()
      : `${carColorLabel(car.color)} ${carTypeLabel(car.type).toLowerCase()}`;
  const plate = car.plate?.trim() ? car.plate.trim().toUpperCase() : null;

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <CarIllustration colorKey={colorKey} type={typeKey} size={88} />
        <View style={styles.info}>
          <Text style={styles.label}>Look for {firstName(driverName)}&apos;s car</Text>
          <Text style={styles.descriptor} numberOfLines={1}>
            {descriptor}
          </Text>
          <Text style={styles.meta}>
            {carColorLabel(car.color)} · {carTypeLabel(car.type)}
          </Text>
        </View>
      </View>

      {plate ? (
        <View style={styles.plateWrap}>
          <Text style={styles.plateCaption}>LICENSE PLATE</Text>
          <View style={styles.plate}>
            <Text style={styles.plateText}>{plate}</Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1.5,
    borderColor: '#E8ECF4',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  info: { flex: 1 },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: '#8391A1',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 2,
  },
  descriptor: { fontSize: 16, fontWeight: '700', color: '#1E232C' },
  meta: { fontSize: 13, color: '#6A707C', marginTop: 1 },
  // A bordered, plate-like chip that reads clearly from a few feet away.
  plateWrap: { alignItems: 'center', marginTop: 16 },
  plateCaption: {
    fontSize: 11,
    fontWeight: '700',
    color: '#8391A1',
    letterSpacing: 1,
    marginBottom: 6,
  },
  plate: {
    alignSelf: 'stretch',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 2.5,
    borderColor: '#1E232C',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  plateText: {
    fontSize: 30,
    fontWeight: '800',
    color: '#1E232C',
    letterSpacing: 4,
    // Monospace so every character is evenly spaced and easy to read aloud.
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
});
