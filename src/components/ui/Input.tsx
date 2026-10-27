import { useEffect, useId, type Ref } from 'react';
import {
  AccessibilityInfo,
  Text,
  TextInput,
  View,
  type TextInputInstance,
  type TextInputProps,
} from 'react-native';

import { MIN_TOUCH_TARGET, useTheme } from '@/theme';

export type InputProps = Omit<TextInputProps, 'style'> & {
  /** Visible label; also the accessibility label of the field. Required. */
  label: string;
  /** Error message. Replaces the helper text, turns the border red and is announced. */
  error?: string;
  helperText?: string;
  /** Layout only (margins, flex). Colour/border overrides conflict with the variant classes. */
  className?: string;
  ref?: Ref<TextInputInstance>;
};

export function Input({
  label,
  error,
  helperText,
  className = '',
  ref,
  ...textInputProps
}: InputProps) {
  const { colors } = useTheme();
  const labelId = useId();
  const hint = error ?? helperText;

  // The live region is Android-only and iOS doesn't announce role="alert", so announce
  // a new error explicitly (an external system: the screen reader).
  useEffect(() => {
    if (error) AccessibilityInfo.announceForAccessibility(error);
  }, [error]);

  return (
    <View className={`gap-xs ${className}`}>
      <Text nativeID={labelId} className="text-sm font-medium text-text">
        {label}
      </Text>
      <TextInput
        ref={ref}
        placeholderTextColor={colors.textMuted}
        {...textInputProps}
        accessibilityLabel={label}
        accessibilityLabelledBy={labelId}
        accessibilityHint={hint}
        style={{ minHeight: MIN_TOUCH_TARGET }}
        className={`rounded-md border bg-surface px-md py-sm text-base text-text ${error ? 'border-danger' : 'border-outline'}`}
      />
      {error ? (
        <Text
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          className="text-sm text-danger"
        >
          {error}
        </Text>
      ) : helperText ? (
        <Text className="text-sm text-text-muted">{helperText}</Text>
      ) : null}
    </View>
  );
}
