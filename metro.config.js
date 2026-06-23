const { getSentryExpoConfig } = require('@sentry/react-native/metro');
const { withNativeWind } = require('nativewind/metro');
const path = require('path');

// getSentryExpoConfig wraps Expo's default Metro config so source maps are
// generated/uploaded for Sentry; it's a drop-in for getDefaultConfig.
const config = getSentryExpoConfig(__dirname);

config.resolver.alias = {
  '@': path.resolve(__dirname),
};

// supabase-js v2.108+ ships an OPTIONAL OpenTelemetry integration. Its CJS build
// (dist/index.cjs, the `react-native`/`require` export condition) loads it via a
// dynamic `require(variable)`, which Metro statically rejects ("Invalid call:
// require(s)"). Its ESM build (dist/index.mjs, the `import` condition) uses a
// dynamic `import()` instead, which Metro handles fine. So we resolve supabase-js
// through its ESM entry by dropping the `react-native` condition for this one
// package. (dynamicDepsInPackages alone can't help: Expo gates 'throwAtRuntime' on
// a /node_modules/ path regex that our `node_modules.nosync` symlink doesn't match.)
config.transformer.dynamicDepsInPackages = 'throwAtRuntime';

const defaultResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const resolve = defaultResolveRequest ?? context.resolveRequest;
  if (
    moduleName === '@supabase/supabase-js' ||
    moduleName.startsWith('@supabase/supabase-js/')
  ) {
    // Drop the `react-native` condition (added per-platform) so the package's
    // `exports` resolves the `import` branch (ESM, dist/index.mjs) instead of
    // `react-native`/`require` (CJS). Only affects supabase-js's own entry; its
    // sub-packages (@supabase/auth-js, realtime-js, …) keep default resolution.
    return resolve(
      {
        ...context,
        unstable_conditionNames: ['import', 'default'],
        unstable_conditionsByPlatform: {},
      },
      moduleName,
      platform,
    );
  }
  return resolve(context, moduleName, platform);
};

module.exports = withNativeWind(config, { input: './global.css' });
