// Tailwind v3 config for NativeWind v4 (TB-17).
// Colour classes resolve to CSS variables set per colour scheme by `UiProvider`,
// so primitives use semantic names (`bg-surface`, `text-muted`) and never raw hex.
// Tailwind loads config dependencies through jiti, so the TypeScript tokens are the single source.
const { COLOR_TOKENS, fontSize, radius, spacing } = require('./src/theme/tokens.ts');

/** `textMuted` → `text-muted` class key and `--color-text-muted` variable. */
const toKebab = (token) => token.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

const themeColors = Object.fromEntries(
  COLOR_TOKENS.map((token) => [
    toKebab(token),
    `rgb(var(--color-${toKebab(token)}) / <alpha-value>)`,
  ]),
);

const px = (scale) => Object.fromEntries(Object.entries(scale).map(([k, v]) => [k, `${v}px`]));

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,jsx,ts,tsx}', './src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: themeColors,
      spacing: px(spacing),
      borderRadius: px(radius),
      fontSize: Object.fromEntries(
        Object.entries(fontSize).map(([k, [size, lineHeight]]) => [
          k,
          [`${size}px`, { lineHeight: `${lineHeight}px` }],
        ]),
      ),
      minHeight: { touch: '44px' },
      minWidth: { touch: '44px' },
    },
  },
  plugins: [],
};
