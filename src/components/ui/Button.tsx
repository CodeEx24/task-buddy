import { ActivityIndicator, Pressable, Text, type PressableProps } from 'react-native';

import { MIN_TOUCH_TARGET, useTheme, type ColorToken } from '@/theme';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive';
export type ButtonSize = 'sm' | 'md';

export type ButtonProps = Omit<PressableProps, 'children' | 'style' | 'disabled'> & {
  /** Visible text; also the accessibility label unless `accessibilityLabel` is given. */
  label: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows a spinner, ignores presses and reports `busy` to assistive tech. */
  loading?: boolean;
  disabled?: boolean;
  className?: string;
};

const CONTAINER: Record<ButtonVariant, string> = {
  primary: 'bg-primary',
  secondary: 'border border-outline bg-surface',
  ghost: 'bg-transparent',
  destructive: 'bg-danger',
};

const LABEL: Record<ButtonVariant, string> = {
  primary: 'text-on-primary',
  secondary: 'text-primary',
  ghost: 'text-primary',
  destructive: 'text-on-danger',
};

/** Spinner colour per variant (ActivityIndicator cannot take a class name). */
const SPINNER: Record<ButtonVariant, ColorToken> = {
  primary: 'onPrimary',
  secondary: 'primary',
  ghost: 'primary',
  destructive: 'onDanger',
};

const SIZE: Record<ButtonSize, { container: string; label: string }> = {
  sm: { container: 'px-md py-xs', label: 'text-sm' },
  md: { container: 'px-lg py-sm', label: 'text-base' },
};

export function Button({
  label,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  className = '',
  accessibilityLabel,
  ...pressableProps
}: ButtonProps) {
  const { colors } = useTheme();
  const isInactive = disabled || loading;

  return (
    <Pressable
      {...pressableProps}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: isInactive, busy: loading }}
      disabled={isInactive}
      style={{ minHeight: MIN_TOUCH_TARGET }}
      className={`flex-row items-center justify-center gap-sm rounded-md active:opacity-80 ${CONTAINER[variant]} ${SIZE[size].container} ${isInactive ? 'opacity-50' : ''} ${className}`}
    >
      {loading ? (
        <ActivityIndicator testID="button-spinner" size="small" color={colors[SPINNER[variant]]} />
      ) : null}
      <Text className={`font-semibold ${LABEL[variant]} ${SIZE[size].label}`}>{label}</Text>
    </Pressable>
  );
}
