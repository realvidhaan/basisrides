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
 * Web-only style that MUST be applied to a screen's root container (the element
 * that holds the header + FormScroll) when that screen scrolls.
 *
 * React Navigation's stack renders each screen inside a card wrapper that uses
 * `flex: 0 0 auto` + `min-height: 100%`. When the screen's content is taller
 * than the viewport, that wrapper grows to the content height instead of
 * staying bounded to the viewport. Every descendant (our SafeAreaView, the
 * ScrollView) then inherits that oversized height, so the ScrollView's height
 * equals its content height and it never has anything to scroll — the submit
 * button ends up below the fold and gets clipped by #root's overflow:hidden.
 *
 * Capping the screen root at the viewport height (100vh) breaks free of that
 * wrapper: the header + ScrollView are forced to fit the viewport, so the
 * ScrollView overflows and scrolls correctly. No-op on native (vh is a
 * web-only unit and native has no such wrapper bug).
 */
export const webScreenFix =
  Platform.OS === 'web'
    ? ({ maxHeight: '100vh' } as unknown as ViewStyle)
    : undefined;

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
