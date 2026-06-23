// Stub for nativewind in Jest (not needed for unit/RLS tests)
module.exports = {
  styled: (component) => component,
  useColorScheme: () => ({ colorScheme: 'light' }),
};
