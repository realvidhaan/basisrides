import * as Sentry from '@sentry/react-native';

// Initialized on import — index.ts imports this module FIRST so Sentry is
// running before any other app code (or its module side effects) executes.
Sentry.init({
  dsn: 'https://4381efb7f0fb5880ab8b9497c3e60fe2@o4511611934212096.ingest.us.sentry.io/4511611941814272',
  // Capture 100% of transactions for performance tracing.
  tracesSampleRate: 1.0,
  debug: false,
  // Native (iOS/Android) crash reporting. On by default; set explicitly so it
  // can't be silently disabled. Requires a native rebuild to take effect.
  enableNative: true,
  enableNativeCrashHandling: true,
  // The ReactNativeErrorHandlers integration (enabled by default) installs the
  // global `onerror` + `onunhandledrejection` hooks, so uncaught JS errors and
  // unhandled promise rejections are reported automatically.
});

export { Sentry };
