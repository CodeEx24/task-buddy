import { contrastRatio, hexToRgb, relativeLuminance } from './contrast';
import { colors, type ColorScheme, type ColorToken } from './tokens';

describe('contrast helpers', () => {
  it('parses 6-digit and 3-digit hex colours', () => {
    expect(hexToRgb('#0F766E')).toEqual([15, 118, 110]);
    expect(hexToRgb('#fff')).toEqual([255, 255, 255]);
  });

  it('rejects malformed hex', () => {
    expect(() => hexToRgb('blue')).toThrow('Invalid hex colour');
    expect(() => hexToRgb('#12345')).toThrow('Invalid hex colour');
  });

  it('computes WCAG relative luminance', () => {
    expect(relativeLuminance('#000000')).toBe(0);
    expect(relativeLuminance('#FFFFFF')).toBe(1);
  });

  it('matches known WCAG contrast ratios', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
    expect(contrastRatio('#FFFFFF', '#000000')).toBeCloseTo(21, 5);
    expect(contrastRatio('#777777', '#FFFFFF')).toBeCloseTo(4.48, 2);
    expect(contrastRatio('#123456', '#123456')).toBe(1);
  });
});

/** Text/background pairs used for body text (AC2: >= 4.5:1). */
const BODY_TEXT_PAIRS: readonly [ColorToken, ColorToken][] = [
  ['text', 'background'],
  ['text', 'surface'],
  ['textMuted', 'background'],
  ['textMuted', 'surface'],
  ['onPrimary', 'primary'],
  ['onDanger', 'danger'],
  ['primary', 'background'], // ghost/secondary button labels
  ['primary', 'surface'],
  ['danger', 'background'], // input error text
  ['danger', 'surface'],
];

/** Non-text UI component boundaries (WCAG 1.4.11: >= 3:1): input and checkbox outlines. */
const UI_BOUNDARY_PAIRS: readonly [ColorToken, ColorToken][] = [
  ['outline', 'background'],
  ['outline', 'surface'],
];

const SCHEMES: readonly ColorScheme[] = ['light', 'dark'];

describe.each(SCHEMES)('%s theme tokens', (scheme) => {
  const palette = colors[scheme];

  it.each(BODY_TEXT_PAIRS)('%s on %s meets 4.5:1', (fg, bg) => {
    expect(contrastRatio(palette[fg], palette[bg])).toBeGreaterThanOrEqual(4.5);
  });

  it.each(UI_BOUNDARY_PAIRS)('%s on %s meets 3:1', (fg, bg) => {
    expect(contrastRatio(palette[fg], palette[bg])).toBeGreaterThanOrEqual(3);
  });
});
