import { Text, View } from 'react-native';

import { Button } from './Button';

export type StepperStep = {
  /** Added to the value (negative to decrease). */
  amount: number;
  /** Short visible label, e.g. `+15m`. Keep it to a few characters so four fit on a phone row. */
  label: string;
  /** Spoken label, e.g. `15 minutes later`. Prefixed with the stepper's label. */
  accessibilityLabel: string;
};

export type StepperProps = {
  /** Visible label above the value. */
  label: string;
  value: number;
  onChange: (value: number) => void;
  /** Display text for the value (e.g. `9:00`, `5 h 30 min`). */
  formatValue: (value: number) => string;
  min: number;
  max: number;
  /** One button per step, in display order (usually decreases first). */
  steps: readonly StepperStep[];
  /** Marks the value as invalid (danger border); the parent shows the message. */
  isInvalid?: boolean;
  testID?: string;
};

/**
 * A number changed by fixed steps (TB-33): the value in large text above a row of step buttons.
 * Results are clamped to `min`–`max`; a button that can't move the value is disabled. Built from
 * `Button`, so labels keep its no-clip layout and the 44 pt touch target.
 */
export function Stepper({
  label,
  value,
  onChange,
  formatValue,
  min,
  max,
  steps,
  isInvalid = false,
  testID,
}: StepperProps) {
  const valueText = formatValue(value);
  return (
    <View testID={testID} className="gap-xs">
      <Text className="text-sm font-medium text-text">{label}</Text>
      <View
        className={`items-center rounded-md border px-md py-sm ${
          isInvalid ? 'border-danger' : 'border-outline'
        }`}
      >
        <Text
          testID={testID ? `${testID}-value` : undefined}
          accessibilityLabel={`${label}: ${valueText}${isInvalid ? ', invalid' : ''}`}
          className="text-xl font-semibold text-text"
        >
          {valueText}
        </Text>
      </View>
      {/* Buttons size to their label and grow to share the row; on a narrow screen or a large
          font they wrap as whole buttons onto a second row instead of breaking a label. */}
      <View className="flex-row flex-wrap gap-sm">
        {steps.map((step) => {
          const next = Math.min(max, Math.max(min, value + step.amount));
          return (
            <Button
              key={step.label}
              testID={testID ? `${testID}-step-${step.amount}` : undefined}
              label={step.label}
              accessibilityLabel={`${label} ${step.accessibilityLabel}`}
              variant="secondary"
              size="sm"
              className="grow"
              disabled={next === value}
              onPress={() => onChange(next)}
            />
          );
        })}
      </View>
    </View>
  );
}
