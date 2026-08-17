interface ColorTokens {
  brandTeal: string;
  brandTealDark: string;
  brandTealLight: string;
  brandOrange: string;
  brandOrangeDark: string;
  brandOrangeLight: string;
  ink: string;
  inkSecondary: string;
  textMuted: string;
  textDisabled: string;
  surfaceWhite: string;
  surfaceSubtle: string;
  surfaceOverlay: string;
  borderDefault: string;
  borderSubtle: string;
  borderFocus: string;
  borderError: string;
  success: string;
  successLight: string;
  warning: string;
  warningLight: string;
  error: string;
  errorLight: string;
  textPrimary: string;
  textSecondary: string;
  textPlaceholder: string;
  bgPage: string;
  bgInput: string;
  accent: string;
  accentSecondary: string;
}

export const colors: ColorTokens = require('./colors.js');
export type ColorToken = keyof ColorTokens;
