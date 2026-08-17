/**
 * Jest configuration for Ridr — Expo SDK 54 + jest-expo preset.
 *
 * References:
 *   https://docs.expo.dev/develop/unit-testing/ (Expo SDK 54)
 *   https://github.com/expo/expo/tree/main/packages/jest-expo
 *
 * Key decisions:
 * - preset: 'jest-expo' runs tests in a React Native-compatible environment.
 * - transformIgnorePatterns: Expo SDK 54 ships many packages as ESM.
 * - moduleNameMapper: maps the '@/*' path alias (from tsconfig.json) to root.
 * - testMatch: matches both suites; the npm scripts filter which run (default
 *   `test`/`test:mocked` = mocked only; `test:live` = the live probe, which
 *   requires .env.test). testMatch must include a file for any pattern to select
 *   it — --testPathPattern only filters within testMatch.
 */

/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',

  testEnvironment: 'node',

  // Match both suites; the npm scripts select which actually run. Keeping the
  // live probe out of testMatch (as before) made `npm run test:live` match zero
  // files and pass vacuously.
  testMatch: ['**/__tests__/**/*.test.ts'],

  // Transform: expo-modules-core and related Expo packages ship ESM and must be
  // transformed by babel-jest. The default jest-expo transformIgnorePatterns
  // already covers most of these; we extend with project-specific packages.
  transformIgnorePatterns: [
    'node_modules/(?!(' + [
      'react-native',
      '@react-native',
      '@react-navigation',
      'expo',
      '@expo',
      '@expo-google-fonts',
      'expo-modules-core',
      'expo-constants',
      'expo-secure-store',
      'expo-notifications',
      'expo-font',
      'expo-haptics',
      'expo-status-bar',
      'expo-updates',
      'expo-task-manager',
      'expo-clipboard',
      'expo-location',
      '@unimodules',
      'unimodules',
      'react-native-url-polyfill',
      'react-native-reanimated',
      '@supabase',
      '@sentry',
      'nativewind',
      'react-native-svg',
      'react-native-safe-area-context',
      'react-native-screens',
      'react-native-gesture-handler',
      'react-native-webview',
      'react-native-worklets',
      'react-native-maps',
    ].join('|') + ')/)',
  ],

  // Map the '@/*' alias from tsconfig to the project root
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
    // Stub asset imports (images, fonts) that jest can't process
    '\\.(jpg|jpeg|png|gif|svg|ttf|woff|woff2)$': '<rootDir>/__mocks__/fileMock.js',
    // Stub CSS modules and global CSS
    '\\.css$': '<rootDir>/__mocks__/fileMock.js',
    // Stub nativewind (not needed for unit/RLS tests)
    '^nativewind$': '<rootDir>/__mocks__/nativewindMock.js',
    '^nativewind/(.*)$': '<rootDir>/__mocks__/nativewindMock.js',
    // Stub tailwindcss
    '^tailwindcss(.*)$': '<rootDir>/__mocks__/fileMock.js',
    // Stub global.css side effect
    '^./global.css$': '<rootDir>/__mocks__/fileMock.js',
  },

  // TypeScript support via babel-jest using the project's existing babel.config.js
  transform: {
    '^.+\\.[jt]sx?$': ['babel-jest', { presets: ['babel-preset-expo'] }],
  },

  // Verbose output so test descriptions are readable
  verbose: true,

  // Don't look in node_modules for tests
  testPathIgnorePatterns: ['/node_modules/', '/node_modules.nosync/'],

  // Resolve from project root for module lookups
  roots: ['<rootDir>'],
  modulePaths: ['<rootDir>'],
};
