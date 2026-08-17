/** @type {import('tailwindcss').Config} */
const colors = require('./constants/theme/colors.js');

module.exports = {
  content: [
    './App.tsx',
    './index.ts',
    './screens/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
  ],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        brand: {
          teal: colors.brandTeal,
          tealDark: colors.brandTealDark,
          tealLight: colors.brandTealLight,
          orange: colors.brandOrange,
          orangeDark: colors.brandOrangeDark,
          orangeLight: colors.brandOrangeLight,
        },
        ink: colors.ink,
        success: colors.success,
      },
    },
  },
  plugins: [],
};
