const { getSentryExpoConfig } = require('@sentry/react-native/metro');
const { withNativeWind } = require('nativewind/metro');
const path = require('path');

// getSentryExpoConfig wraps Expo's default Metro config so source maps are
// generated/uploaded for Sentry; it's a drop-in for getDefaultConfig.
const config = getSentryExpoConfig(__dirname);

config.resolver.alias = {
  '@': path.resolve(__dirname),
};

// supabase-js v2.108+ ships an OPTIONAL OpenTelemetry integration, and BOTH of
// its builds load it in a way Metro dislikes:
//   - CJS (dist/index.cjs, the `react-native`/`require` condition) uses a dynamic
//     `require(variable)`, which Metro statically rejects — unless
//     dynamicDepsInPackages is 'throwAtRuntime', which rewrites it to a runtime
//     throw. That's harmless here: the call sits inside a `.catch(() => null)`,
//     so a missing OTel package degrades to null exactly as intended.
//   - ESM (dist/index.mjs, the `import` condition) uses `import(VARIABLE)`. Metro
//     bundles it happily, but it cannot transform a COMPUTED specifier, so the
//     raw `import()` survives into the bundle and **hermesc rejects it**
//     ("Invalid expression encountered"). Metro serves plain JS in a debug build,
//     so this only surfaces when Hermes compiles — i.e. `expo export`, a Release
//     build, or an EAS build. It is a submission blocker that a simulator demo
//     never reveals.
// So we take the CJS branch (the default resolution) plus 'throwAtRuntime', and
// deliberately do NOT override resolution for supabase-js. `expo export
// --platform ios` is the regression test for this: it must emit a .hbc bundle.
//
// A previous revision routed supabase-js to ESM to dodge the CJS require, noting
// that 'throwAtRuntime' didn't apply because Expo gates it on a /node_modules/
// path regex that a `node_modules.nosync` symlink didn't match. With a real
// node_modules directory the gate matches and the CJS path works.
config.transformer.dynamicDepsInPackages = 'throwAtRuntime';

module.exports = withNativeWind(config, { input: './global.css' });
