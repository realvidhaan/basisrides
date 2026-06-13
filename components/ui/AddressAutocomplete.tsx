import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Input } from '@/components/ui/Input';
import { searchAddresses, type AddressSuggestion } from '@/lib/geocode';
import { impact } from '@/lib/haptics';

interface Props {
  label?: string;
  value: string;
  /** Fired on every keystroke; clears any previously selected coordinates. */
  onChangeText: (text: string) => void;
  /** Fired when the user taps a suggestion — gives you exact coordinates. */
  onSelect: (suggestion: AddressSuggestion) => void;
  placeholder?: string;
  error?: string | null;
  helperText?: string;
}

/**
 * Worldwide address field with a Google-Maps-style dropdown of real addresses,
 * powered by free OpenStreetMap/Nominatim search. Debounced to respect the
 * service's ~1 req/sec policy; picking a suggestion hands back exact lat/lng so
 * the caller never has to geocode again. If search fails it silently degrades to
 * a plain text input.
 */
export function AddressAutocomplete({
  label,
  value,
  onChangeText,
  onSelect,
  placeholder,
  error,
  helperText,
}: Props) {
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  // Set true the instant a suggestion is picked so the resulting onChangeText
  // (from setting the field to the chosen address) doesn't reopen the dropdown.
  const justPicked = useRef(false);

  useEffect(() => {
    if (justPicked.current) {
      justPicked.current = false;
      return;
    }
    const q = value.trim();
    if (q.length < 4) {
      setSuggestions([]);
      setOpen(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    let active = true;
    const handle = setTimeout(() => {
      void searchAddresses(q).then((results) => {
        if (!active) return;
        setSuggestions(results);
        setOpen(results.length > 0);
        setLoading(false);
      });
    }, 600); // debounce: stay under Nominatim's rate limit
    return () => {
      active = false;
      clearTimeout(handle);
    };
  }, [value]);

  function pick(s: AddressSuggestion): void {
    justPicked.current = true;
    // The picked suggestion carries verified coordinates — confirm with a tap.
    impact();
    onSelect(s);
    setSuggestions([]);
    setOpen(false);
    setLoading(false);
  }

  return (
    <View style={styles.wrapper}>
      <Input
        label={label}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        error={error}
        autoCapitalize="words"
        autoCorrect={false}
      />
      {helperText ? <Text style={styles.helper}>{helperText}</Text> : null}

      {open ? (
        <View style={styles.dropdown}>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            nestedScrollEnabled
            style={styles.dropdownScroll}
          >
            {suggestions.map((s, i) => (
              <Pressable
                key={`${s.lat},${s.lng},${i}`}
                onPress={() => pick(s)}
                style={({ pressed }) => [
                  styles.row,
                  i > 0 && styles.rowBorder,
                  pressed && styles.rowPressed,
                ]}
              >
                <Text style={styles.rowText} numberOfLines={2}>
                  {s.label}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : loading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" color="#8391A1" />
          <Text style={styles.loadingText}>Searching addresses…</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // High zIndex so the dropdown floats above fields rendered after it.
  wrapper: { position: 'relative', zIndex: 20 },
  helper: { fontSize: 12, color: '#8391A1', marginTop: -10, marginBottom: 8 },
  dropdown: {
    borderWidth: 1.5,
    borderColor: '#E0E0E0',
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    marginTop: -8,
    marginBottom: 12,
    overflow: 'hidden',
    // Subtle elevation so it reads as a floating menu.
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  dropdownScroll: { maxHeight: 220 },
  row: { paddingVertical: 12, paddingHorizontal: 14 },
  rowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#E8ECF4' },
  rowPressed: { backgroundColor: '#F7F8F9' },
  rowText: { fontSize: 14, color: '#1E232C', lineHeight: 19 },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: -8,
    marginBottom: 12,
    paddingHorizontal: 2,
  },
  loadingText: { fontSize: 12, color: '#8391A1' },
});
