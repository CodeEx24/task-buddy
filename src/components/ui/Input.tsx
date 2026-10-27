import { useId, type Ref } from 'react';
import { Text, TextInput, View, type TextInputInstance, type TextInputProps } from 'react-native';

import { MIN_TOUCH_TARGET, useTheme } from '@/theme';

export type InputProps = Omit<TextInputProps, 'style'> & {
  /** Visible label; also the accessibility label of the field. Required. */
  label: string;
  /** Error message. Replaces the helper text, turns the border red and is announced. */
  error?: string;
  helperText?: string;
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
