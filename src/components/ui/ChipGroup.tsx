import { Pressable, Text, View } from 'react-native';

import { MIN_TOUCH_TARGET } from '@/theme';

export type ChipOption<T extends string | number> = { value: T; label: string };

export type ChipGroupProps<T extends string | number> = {
  /** Visible group label; also the radio group's accessibility label. */
  label: string;
  options: readonly ChipOption<T>[];
  /** Controlled value; `null` selects no chip. */
  value: T | null;
  /** Called with the chosen option's value; the parent owns the state. */
  onChange: (value: T) => void;
  className?: string;
  testID?: string;
};

/**
 * Single-choice chips (TB-26), exposed as a radio group: each chip is a `radio` with its checked
 * state, 44 pt tall. Use for short option sets (priority, quick dates).
 */
export function ChipGroup<T extends string | number>({
  label,
  options,
  value,
  onChange,
  className = '',
  testID,
}: ChipGroupProps<T>) {
  return (
    <View className={`gap-xs ${className}`}>
      <Text className="text-sm font-medium text-text">{label}</Text>
      <View
        testID={testID}
        accessibilityRole="radiogroup"
        accessibilityLabel={label}
        className="flex-row flex-wrap gap-sm"
      >
        {options.map((option) => {
          const isSelected = option.value === value;
          return (
            <Pressable
              key={String(option.value)}
              testID={testID ? `${testID}-${option.value}` : undefined}
              accessibilityRole="radio"
              accessibilityLabel={option.label}
              accessibilityState={{ checked: isSelected }}
              onPress={() => onChange(option.value)}
              style={{ minHeight: MIN_TOUCH_TARGET }}
              className={`items-center justify-center rounded-full border px-md active:opacity-80 ${
                isSelected ? 'border-primary bg-primary' : 'border-outline bg-surface'
              }`}
            >
              <Text
                className={`text-sm font-medium ${isSelected ? 'text-on-primary' : 'text-text'}`}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
