// NativeWind v4 (TB-17) + Drizzle SQL migrations (TB-21) + Sentry debug IDs (TB-37).
const { getSentryExpoConfig } = require('@sentry/react-native/metro');
const { withNativeWind } = require('nativewind/metro');

// TB-37: Expo's default config plus Sentry debug IDs, so uploaded source maps match the bundle.
const config = getSentryExpoConfig(__dirname);

// TB-21: let Metro resolve the generated drizzle/*.sql migrations (inlined by Babel).
config.resolver.sourceExts.push('sql');

module.exports = withNativeWind(config, {
  input: './global.css',
  // nativewind-env.d.ts is committed and already covered by tsconfig's "**/*.ts" include,
  // so stop NativeWind from rewriting tsconfig.json on every bundle.
  disableTypeScriptGeneration: true,
});
