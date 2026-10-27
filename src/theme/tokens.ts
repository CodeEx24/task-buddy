/**
 * Design tokens: the single source of colour, spacing, radius and type values (TB-17).
 * Consumed by `tailwind.config.js` (class names) and `theme-vars.ts` (CSS variables).
 * Keep this file free of imports: Tailwind loads it directly at build time.
 *
 * Palette: calm slate neutrals + one teal accent. Every body-text pair passes WCAG 4.5:1 in
 * both themes (enforced by `contrast.test.ts`).
 */

export type ColorScheme = 'light' | 'dark';

export type ColorToken =
  | 'background'
  | 'surface'
  | 'border'
  | 'outline'
  | 'text'
  | 'textMuted'
  | 'primary'
  | 'onPrimary'
  | 'danger'
  | 'onDanger'
  | 'success';

export type Palette = Readonly<Record<ColorToken, string>>;

export const colors: Readonly<Record<ColorScheme, Palette>> = {
  light: {
    background: '#F8FAFC',
    surface: '#FFFFFF',
    border: '#E2E8F0', // decorative dividers and card edges only
    outline: '#64748B', // input and checkbox boundaries (>= 3:1)
    text: '#0F172A',
    textMuted: '#475569',
    primary: '#0F766E',
    onPrimary: '#FFFFFF',
    danger: '#B91C1C',
    onDanger: '#FFFFFF',
    success: '#15803D',
  },
  dark: {
    background: '#0B1120',
    surface: '#1E293B',
    border: '#334155',
    outline: '#94A3B8',
    text: '#F1F5F9',
    textMuted: '#94A3B8',
    primary: '#5EEAD4',
    onPrimary: '#042F2E',
    danger: '#FCA5A5',
    onDanger: '#450A0A',
    success: '#4ADE80',
  },
};

export const COLOR_TOKENS = Object.keys(colors.light) as ColorToken[];

/** Spacing scale in density-independent pixels. */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  '2xl': 32,
} as const;

export const radius = {
  sm: 6,
  md: 10,
  lg: 16,
  full: 9999,
} as const;

/** Type scale: [fontSize, lineHeight]. */
export const fontSize = {
  sm: [14, 20],
  base: [16, 24],
  lg: [18, 26],
  xl: [22, 28],
  '2xl': [28, 34],
} as const;

/** Minimum touch target (iOS HIG 44pt; Android 48dp is met by padding where needed). */
export const MIN_TOUCH_TARGET = 44;
