import React, { useState } from 'react';
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

export interface SelectOption {
  label: string;
  value: string;
}

interface Props {
  label: string;
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  error?: string;
}

/**
 * Tap-to-open selector backed by a Modal + ScrollView. Replaces the native
 * @react-native-picker/picker wheel, whose iOS UIPickerView crashes with
 * EXC_BAD_ACCESS (`_updateVisibleCellsNow`) on the New Architecture (RN 0.81 /
 * iOS 18+). A plain ScrollView is UIScrollView-backed and never hits that path,
 * and tap-to-select is better UX for long lists (states, cities) than a wheel.
 */
export function SelectField({
  label,
  value,
  options,
  onChange,
  placeholder = 'Select…',
  error,
}: Props) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value && o.value !== '');

  function choose(v: string): void {
    onChange(v);
    setOpen(false);
  }

  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>{label}</Text>
      <TouchableOpacity
        style={[styles.field, error ? styles.fieldError : null]}
        onPress={() => setOpen(true)}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${selected?.label ?? placeholder}`}
      >
        <Text style={[styles.value, !selected && styles.placeholder]} numberOfLines={1}>
          {selected?.label ?? placeholder}
        </Text>
        <Ionicons name="chevron-down" size={18} color="#8391A1" />
      </TouchableOpacity>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <Modal
        visible={open}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setOpen(false)}
      >
        <SafeAreaView style={styles.modalContainer} edges={['top']}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{label}</Text>
            <TouchableOpacity
              onPress={() => setOpen(false)}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <Text style={styles.done}>Done</Text>
            </TouchableOpacity>
          </View>
          <ScrollView showsVerticalScrollIndicator={false}>
            {options
              .filter((o) => o.value !== '')
              .map((o) => {
                const active = o.value === value;
                return (
                  <TouchableOpacity
                    key={o.value}
                    style={styles.row}
                    onPress={() => choose(o.value)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.rowText, active && styles.rowTextActive]}>
                      {o.label}
                    </Text>
                    {active ? (
                      <Ionicons name="checkmark" size={20} color="#DC143C" />
                    ) : null}
                  </TouchableOpacity>
                );
              })}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { marginBottom: 16 },
  label: { fontSize: 13, fontWeight: '500', color: '#0A0A0A', marginBottom: 6 },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1.5,
    borderColor: '#E0E0E0',
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    height: 52,
    paddingHorizontal: 14,
  },
  fieldError: { borderColor: '#DC143C' },
  value: { flex: 1, fontSize: 15, color: '#0A0A0A', marginRight: 8 },
  placeholder: { color: '#A0A0A0' },
  errorText: { fontSize: 12, color: '#DC143C', marginTop: 4 },
  modalContainer: { flex: 1, backgroundColor: '#FFFFFF' },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E0E0E0',
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#1E232C' },
  done: { fontSize: 16, fontWeight: '600', color: '#DC143C' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F0F0F0',
  },
  rowText: { fontSize: 16, color: '#1E232C' },
  rowTextActive: { color: '#DC143C', fontWeight: '600' },
});
