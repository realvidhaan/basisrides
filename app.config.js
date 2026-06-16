// Dynamic Expo config.
//
// app.json stays the source of truth. The only thing this file does is make the
// app runnable in **Expo Go**: Expo Go can only load a project whose runtime is
// `exposdk:<version>`, but app.json sets `runtimeVersion: { policy: "fingerprint" }`
// for EAS Build / EAS Update. When we start the dev server with `EXPO_GO=1`, we strip
// the explicit runtimeVersion so the manifest advertises `exposdk:56.0.0` and Expo Go
// accepts it. For EAS builds/updates, run without EXPO_GO and the fingerprint policy is kept.
module.exports = ({ config }) => {
  if (process.env.EXPO_GO === '1') {
    delete config.runtimeVersion;
  }
  return config;
};
