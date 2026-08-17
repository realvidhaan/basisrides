// Ridr — color tokens. Single hand-typed source of truth, mirrored from
// the Ridr design handoff (tokens/colors.css). Plain CommonJS so
// tailwind.config.js (require()'d by Metro at boot, no TS transform) and
// app code can both read the exact same values.
module.exports = {
  // Brand
  brandTeal: '#0F8B8D',
  brandTealDark: '#0B6B6D',
  brandTealLight: '#E6F5F5',
  brandOrange: '#F2994A',
  brandOrangeDark: '#D97F2E',
  brandOrangeLight: '#FEF1E4',

  // Neutrals
  ink: '#1B2523',
  inkSecondary: '#55635F',
  textMuted: '#7C8C8B',
  textDisabled: '#AAB5B2',

  // Surfaces
  surfaceWhite: '#FFFFFF',
  surfaceSubtle: '#F4F9F9',
  surfaceOverlay: 'rgba(27,37,35,0.04)',

  // Borders
  borderDefault: '#D8E4E3',
  borderSubtle: '#E3ECEA',
  borderFocus: '#0F8B8D',
  borderError: '#E5484D',

  // Semantic
  success: '#1E9E6B',
  successLight: '#EAFBF3',
  warning: '#F2994A',
  warningLight: '#FEF1E4',
  error: '#E5484D',
  errorLight: '#FDEEEE',

  // Aliases
  textPrimary: '#1B2523',
  textSecondary: '#55635F',
  textPlaceholder: '#7C8C8B',
  bgPage: '#FFFFFF',
  bgInput: '#F4F9F9',
  accent: '#0F8B8D',
  accentSecondary: '#F2994A',
};
