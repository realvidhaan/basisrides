// Dynamic Expo config.
//
// app.json stays the source of truth. The only thing this file does is make the
// app runnable in **Expo Go**: Expo Go can only load a project whose runtime is
// `exposdk:<version>`, but app.json sets `runtimeVersion: { policy: "fingerprint" }`
// for EAS Build / EAS Update. When we start the dev server with `EXPO_GO=1`, we strip
// the explicit runtimeVersion so the manifest advertises `exposdk:54.0.0` and Expo Go
// accepts it. For EAS builds/updates, run without EXPO_GO and the fingerprint policy is kept.
module.exports = ({ config }) => {
  if (process.env.EXPO_GO === '1') {
    delete config.runtimeVersion;
  }

  // Android's native map (react-native-maps -> Google Maps) needs a Maps SDK for
  // Android key. The SDK itself is free/unlimited, but the key is a secret, so we
  // inject it from the environment at build time instead of committing it. Set
  // ANDROID_MAPS_API_KEY as an EAS secret (`eas secret:create`) or local env.
  // iOS uses Apple Maps and needs no key. Without the key, Android renders a
  // blank/grey map but the app still runs.
  if (process.env.ANDROID_MAPS_API_KEY) {
    config.android = config.android ?? {};
    config.android.config = config.android.config ?? {};
    config.android.config.googleMaps = {
      ...config.android.config.googleMaps,
      apiKey: process.env.ANDROID_MAPS_API_KEY,
    };
  }

  return config;
};
