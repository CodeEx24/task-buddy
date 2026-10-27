import { vars } from 'nativewind';

import { hexToRgb } from './contrast';
import { COLOR_TOKENS, colors, type ColorScheme, type ColorToken, type Palette } from './tokens';

/** CSS variable name for a colour token, e.g. `textMuted` → `--color-text-muted`. */
export function colorVarName(token: ColorToken): `--color-${string}` {
  return `--color-${token.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;
}

/** Maps a palette to space-separated RGB channels so Tailwind can apply `<alpha-value>`. */
export function toCssVariables(palette: Palette): Record<string, string> {
  const entries = COLOR_TOKENS.map((token) => [
    colorVarName(token),
    hexToRgb(palette[token]).join(' '),
  ]);
  return Object.fromEntries(entries);
}

/** NativeWind style objects that define every colour variable for each scheme. */
export const themeVars: Readonly<Record<ColorScheme, ReturnType<typeof vars>>> = {
  light: vars(toCssVariables(colors.light)),
  dark: vars(toCssVariables(colors.dark)),
};
