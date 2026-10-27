import { colorVarName, themeVars, toCssVariables } from './theme-vars';
import { COLOR_TOKENS, colors } from './tokens';

describe('theme variables', () => {
  it('names variables in kebab case', () => {
    expect(colorVarName('textMuted')).toBe('--color-text-muted');
    expect(colorVarName('onPrimary')).toBe('--color-on-primary');
  });

  it('defines every token as RGB channels for both schemes', () => {
    const light = toCssVariables(colors.light);
    expect(Object.keys(light)).toHaveLength(COLOR_TOKENS.length);
    expect(light['--color-primary']).toBe('15 118 110');
    expect(toCssVariables(colors.dark)['--color-background']).toBe('11 17 32');
  });

  it('builds a NativeWind vars style per scheme', () => {
    expect(themeVars.light).toBeDefined();
    expect(themeVars.dark).toBeDefined();
    expect(themeVars.light).not.toBe(themeVars.dark);
  });

  it('maps every token to a Tailwind colour backed by its variable', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const tailwindConfig = require('../../tailwind.config.js') as {
      theme: { extend: { colors: Record<string, string> } };
    };
    const twColors = tailwindConfig.theme.extend.colors;
    for (const token of COLOR_TOKENS) {
      const name = colorVarName(token).replace('--color-', '');
      expect(twColors[name]).toBe(`rgb(var(${colorVarName(token)}) / <alpha-value>)`);
    }
  });
});
