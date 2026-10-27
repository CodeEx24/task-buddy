import { Pressable, Text, View } from 'react-native';

import { MIN_TOUCH_TARGET } from '@/theme';

export type CheckboxProps = {
  label: string;
  /** Controlled value. */
  checked: boolean;
  /** Called with the requested next value; the parent owns the state. */
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
  testID?: string;
};

export function Checkbox({
  label,
  checked,
  onCheckedChange,
  disabled = false,
  className = '',
  testID,
}: CheckboxProps) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked, disabled }}
      disabled={disabled}
      onPress={() => onCheckedChange(!checked)}
      style={{ minHeight: MIN_TOUCH_TARGET }}
      className={`flex-row items-center gap-md active:opacity-80 ${disabled ? 'opacity-50' : ''} ${className}`}
    >
      <View
        className={`h-6 w-6 items-center justify-center rounded-sm border-2 ${
          checked ? 'border-primary bg-primary' : 'border-outline bg-surface'
        }`}
      >
        {checked ? (
          <Text
            importantForAccessibility="no"
            accessibilityElementsHidden
            className="text-sm font-bold text-on-primary"
          >
            ✓
          </Text>
        ) : null}
      </View>
      <Text className="flex-shrink text-base text-text">{label}</Text>
    </Pressable>
  );
}
