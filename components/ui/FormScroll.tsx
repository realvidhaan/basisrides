import React from 'react';
import {
  Platform,
  ScrollView,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';

interface FormScrollProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
}

/**
 * Scroll container for forms.
 *
 * On web, react-native-keyboard-aware-scroll-view does not establish a
 * scrollable height, so long forms get clipped and the submit button becomes
 * unreachable. We use a plain ScrollView there (no soft keyboard on web, so the
 * keyboard-aware behaviour is unnecessary). On native we keep the keyboard-aware
 * version so focused inputs scroll into view above the keyboard.
 */
export function FormScroll({
  children,
  style,
  contentContainerStyle,
}: FormScrollProps) {
  if (Platform.OS === 'web') {
    return (
      <ScrollView
        style={style}
        contentContainerStyle={contentContainerStyle}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>
    );
  }

  return (
    <KeyboardAwareScrollView
      style={style}
      contentContainerStyle={contentContainerStyle}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      enableOnAndroid
      extraScrollHeight={16}
    >
      {children}
    </KeyboardAwareScrollView>
  );
}
