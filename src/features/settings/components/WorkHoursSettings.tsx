import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useWatch } from 'react-hook-form';
import { ActivityIndicator, Text, View } from 'react-native';

import { Button, Stepper, type StepperStep } from '@/components/ui';

import {
  clockTimeToMinutes,
  MIN_CAPACITY_MINUTES,
  MINUTES_PER_DAY,
  minutesToClockTime,
  PLANNING_STEP_MINUTES,
  planningConstraintsSchema,
  workHoursSpanMinutes,
  type PlanningConstraints,
} from '../../../../packages/schemas/src/planning';
import { usePreference } from '../hooks/use-preference';
import { planningConstraintsPreference } from '../preferences/planning';

export const WORK_HOURS_SAVE_ERROR = "Couldn't save your work hours. Try again.";
export const WORK_HOURS_SAVED = 'Saved. Your daily plan will use these hours.';

/** Latest start or end time: 23:45 (work hours stay within one day). */
const LAST_CLOCK_MINUTE = MINUTES_PER_DAY - PLANNING_STEP_MINUTES;

const TIME_STEPS: readonly StepperStep[] = [
  { amount: -60, label: '−1h', accessibilityLabel: '1 hour earlier' },
  { amount: -PLANNING_STEP_MINUTES, label: '−15m', accessibilityLabel: '15 minutes earlier' },
  { amount: PLANNING_STEP_MINUTES, label: '+15m', accessibilityLabel: '15 minutes later' },
  { amount: 60, label: '+1h', accessibilityLabel: '1 hour later' },
];

const CAPACITY_STEPS: readonly StepperStep[] = [
  { amount: -60, label: '−1h', accessibilityLabel: '1 hour less' },
  { amount: -PLANNING_STEP_MINUTES, label: '−15m', accessibilityLabel: '15 minutes less' },
  { amount: PLANNING_STEP_MINUTES, label: '+15m', accessibilityLabel: '15 minutes more' },
  { amount: 60, label: '+1h', accessibilityLabel: '1 hour more' },
];

/** `09:00` → `9:00` (24-hour clock, no leading zero). */
export function formatClockMinutes(minutes: number): string {
  return minutesToClockTime(minutes).replace(/^0(\d)/, '$1');
}

/** 300 → `5 h`, 330 → `5 h 30 min`, 45 → `45 min`. */
export function formatDuration(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes} min`;
  return minutes === 0 ? `${hours} h` : `${hours} h ${minutes} min`;
}

/** Work hours page (TB-33): waits for the stored value, then edits it in a form. */
export function WorkHoursSettings() {
  const preference = usePreference(planningConstraintsPreference);
  if (preference.isLoading) {
    return <ActivityIndicator testID="work-hours-loading" accessibilityLabel="Loading" />;
  }
  return (
    <WorkHoursForm
      initialValue={preference.value}
      onSave={preference.setValue}
      saveError={preference.error}
    />
  );
}

type WorkHoursFormProps = {
  initialValue: PlanningConstraints;
  onSave: (value: PlanningConstraints) => void;
  saveError: Error | null;
};

/**
 * Start, end and capacity steppers (15-minute steps) with an explicit Save. React Hook Form +
 * `planningConstraintsSchema`: end before start, or capacity longer than the work hours, shows an
 * inline error under the field and Save writes nothing.
 */
function WorkHoursForm({ initialValue, onSave, saveError }: WorkHoursFormProps) {
  const {
    control,
    setValue,
    trigger,
    handleSubmit,
    reset,
    formState: { errors, isDirty, isSubmitSuccessful },
  } = useForm<PlanningConstraints, unknown, PlanningConstraints>({
    resolver: zodResolver(planningConstraintsSchema),
    defaultValues: initialValue,
  });

  const start = useWatch({ control, name: 'workHours.start' });
  const end = useWatch({ control, name: 'workHours.end' });
  const capacityMinutes = useWatch({ control, name: 'capacityMinutes' });
  const startMinutes = clockTimeToMinutes(start);
  const endMinutes = clockTimeToMinutes(end);

  // Each field's rule depends on the others (end after start, capacity within the span), so a
  // change re-validates the whole form and every message stays current.
  const change = (
    name: 'workHours.start' | 'workHours.end' | 'capacityMinutes',
    value: string | number,
  ) => {
    setValue(name, value, { shouldDirty: true });
    void trigger();
  };

  const save = handleSubmit((values) => {
    onSave(values);
    // The saved values become the new baseline: Save shows "Saved" until the next change.
    reset(values, { keepIsSubmitSuccessful: true });
  });

  const endError = errors.workHours?.end?.message;
  const capacityError = errors.capacityMinutes?.message;
  const isOrderValid = endMinutes > startMinutes;

  return (
    <View testID="work-hours-form" className="gap-lg">
      <Stepper
        testID="work-hours-start"
        label="Start"
        value={startMinutes}
        min={0}
        max={LAST_CLOCK_MINUTE}
        steps={TIME_STEPS}
        formatValue={formatClockMinutes}
        onChange={(minutes) => change('workHours.start', minutesToClockTime(minutes))}
      />
      <Stepper
        testID="work-hours-end"
        label="End"
        value={endMinutes}
        min={0}
        max={LAST_CLOCK_MINUTE}
        steps={TIME_STEPS}
        formatValue={formatClockMinutes}
        isInvalid={Boolean(endError)}
        onChange={(minutes) => change('workHours.end', minutesToClockTime(minutes))}
      />
      {endError ? (
        <Text
          testID="work-hours-end-error"
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          className="text-sm text-danger"
        >
          {endError}
        </Text>
      ) : null}

      <Stepper
        testID="work-hours-capacity"
        label="Daily capacity"
        value={capacityMinutes}
        min={MIN_CAPACITY_MINUTES}
        max={LAST_CLOCK_MINUTE}
        steps={CAPACITY_STEPS}
        formatValue={formatDuration}
        isInvalid={Boolean(capacityError)}
        onChange={(minutes) => change('capacityMinutes', minutes)}
      />
      {capacityError ? (
        <Text
          testID="work-hours-capacity-error"
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          className="text-sm text-danger"
        >
          {capacityError}
        </Text>
      ) : null}
      <Text testID="work-hours-hint" className="text-sm text-text-muted">
        {isOrderValid
          ? `Your work hours are ${formatDuration(workHoursSpanMinutes({ start, end }))}. `
          : ''}
        Capacity is how much task time the planner may fill; the rest stays free for breaks and
        meetings.
      </Text>

      <Button testID="work-hours-save" label="Save" onPress={() => save()} />
      {saveError ? (
        <Text
          testID="work-hours-save-error"
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          className="text-sm text-danger"
        >
          {WORK_HOURS_SAVE_ERROR}
        </Text>
      ) : isSubmitSuccessful && !isDirty ? (
        <Text testID="work-hours-saved" className="text-sm text-text-muted">
          {WORK_HOURS_SAVED}
        </Text>
      ) : null}
    </View>
  );
}
