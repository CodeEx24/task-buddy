// NativeWind v4 (TB-17). TB-21 appends to this file after TB-17 merges.
const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);

module.exports = withNativeWind(config, {
  input: './global.css',
  // nativewind-env.d.ts is committed and already covered by tsconfig's "**/*.ts" include,
  // so stop NativeWind from rewriting tsconfig.json on every bundle.
  disableTypeScriptGeneration: true,
});
