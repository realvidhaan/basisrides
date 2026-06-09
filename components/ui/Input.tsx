import React, { forwardRef, useState } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  View,
  type KeyboardTypeOptions,
  type ReturnKeyTypeOptions,
  type TextInputProps,
} from 'react-native';

interface InputProps {
  label?: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  error?: string | null;
  secureTextEntry?: boolean;
  keyboardType?: KeyboardTypeOptions;
  autoCapitalize?: TextInputProps['autoCapitalize'];
  returnKeyType?: ReturnKeyTypeOptions;
  onSubmitEditing?: () => void;
  autoCorrect?: boolean;
  rightAccessory?: React.ReactNode;
}

export const Input = forwardRef<TextInput, InputProps>(
  (
    {
      label,
      value,
      onChangeText,
      placeholder,
      error,
      secureTextEntry = false,
      keyboardType = 'default',
      autoCapitalize = 'sentences',
      returnKeyType = 'done',
      onSubmitEditing,
      autoCorrect = true,
      rightAccessory,
    },
    ref,
  ) => {
    const [focused, setFocused] = useState(false);
    const hasError = Boolean(error);

    return (
      <View style={styles.wrapper}>
        {label ? <Text style={styles.label}>{label}</Text> : null}
        <View
          style={[
            styles.inputContainer,
            focused && styles.inputContainerFocused,
            hasError && styles.inputContainerError,
          ]}
        >
          <TextInput
            ref={ref}
            style={styles.input}
            value={value}
            onChangeText={onChangeText}
            placeholder={placeholder}
            placeholderTextColor="#A0A0A0"
            secureTextEntry={secureTextEntry}
            keyboardType={keyboardType}
            autoCapitalize={autoCapitalize}
            returnKeyType={returnKeyType}
            onSubmitEditing={onSubmitEditing}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            autoCorrect={autoCorrect}
            blurOnSubmit={returnKeyType === 'done'}
          />
          {rightAccessory}
        </View>
        {hasError && <Text style={styles.errorText}>{error}</Text>}
      </View>
    );
  },
);

Input.displayName = 'Input';

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: 16,
  },
  label: {
    fontSize: 13,
    fontWeight: '500',
    color: '#0A0A0A',
    marginBottom: 6,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 52,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E0E0E0',
    borderRadius: 10,
    paddingHorizontal: 16,
  },
  inputContainerFocused: {
    borderColor: '#DC143C',
  },
  inputContainerError: {
    borderColor: '#DC143C',
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: '#0A0A0A',
    padding: 0,
  },
  errorText: {
    fontSize: 12,
    color: '#DC143C',
    marginTop: 4,
  },
});
