// NativeWind v4 (TB-17) + Drizzle SQL migrations (TB-21).
module.exports = function (api) {
  api.cache(true);
  return {
    presets: [['babel-preset-expo', { jsxImportSource: 'nativewind' }], 'nativewind/babel'],
    // TB-21: drizzle/migrations.js imports the generated .sql migrations as strings.
    plugins: [['inline-import', { extensions: ['.sql'] }]],
  };
};
