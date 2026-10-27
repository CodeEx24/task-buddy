// NativeWind v4 (TB-17). TB-21 appends to this file after TB-17 merges.
module.exports = function (api) {
  api.cache(true);
  return {
    presets: [['babel-preset-expo', { jsxImportSource: 'nativewind' }], 'nativewind/babel'],
  };
};
