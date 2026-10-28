import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { Text, View } from 'react-native';

import { Button, ChipGroup, Input, type ChipOption } from '@/components/ui';
import { addLocalDays, toDateInput } from '@/lib/dates';
import { useNow } from '@/lib/use-now';

import { TASK_PRIORITIES } from '../priority';
import {
  EMPTY_TASK_FORM,
  taskFormSchema,
  toTaskFields,
  type ParsedTaskForm,
  type TaskFields,
  type TaskFormValues,
} from '../task-form';

export const SAVE_FAILED_MESSAGE = "Couldn't save. Please try again.";

type QuickDate = 'none' | 'today' | 'tomorrow' | 'next-week';

const QUICK_DATES: readonly ChipOption<QuickDate>[] = [
  { value: 'none', label: 'No date' },
  { value: 'today', label: 'Today' },
  { value: 'tomorrow', label: 'Tomorrow' },
  { value: 'next-week', label: 'Next week' },
];

const QUICK_DATE_OFFSETS: Record<Exclude<QuickDate, 'none'>, number> = {
  today: 0,
  tomorrow: 1,
  'next-week': 7,
};

function quickDateValue(choice: QuickDate, now: number): string {
  return choice === 'none' ? '' : toDateInput(addLocalDays(now, QUICK_DATE_OFFSETS[choice]));
}

/** The chip matching the typed date, or null for any other date. */
function quickDateFor(dueDate: string, now: number): QuickDate | null {
  return QUICK_DATES.find((c) => quickDateValue(c.value, now) === dueDate.trim())?.value ?? null;
}

export type TaskFormProps = {
  defaultValues?: TaskFormValues;
  submitLabel: string;
  /** Resolves once saved; a rejection shows a generic error and keeps the form open. */
  onSubmit: (fields: TaskFields) => Promise<void>;
};

/**
 * Add/edit task form (TB-26): title, due date (quick chips or `YYYY-MM-DD`) and priority.
 * React Hook Form + Zod (`taskFormSchema`); errors show under each field.
 */
export function TaskForm({
  defaultValues = EMPTY_TASK_FORM,
  submitLabel,
  onSubmit,
}: TaskFormProps) {
  const {
    control,
    handleSubmit,
    setError,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<TaskFormValues, unknown, ParsedTaskForm>({
    resolver: zodResolver(taskFormSchema),
    defaultValues,
  });
  const now = useNow();
  const dueDate = useWatch({ control, name: 'dueDate' });

  const submit = handleSubmit(async (values) => {
    try {
      await onSubmit(toTaskFields(values));
    } catch {
      // The repository error carries no user content, but the user only needs to know it failed.
      setError('root', { message: SAVE_FAILED_MESSAGE });
    }
  });

  return (
    <View className="gap-lg" testID="task-form">
      <Controller
        control={control}
        name="title"
        render={({ field }) => (
          <Input
            testID="task-form-title"
            label="Title"
            placeholder="e.g. Pay the electricity bill"
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={errors.title?.message}
            returnKeyType="done"
          />
        )}
      />

      <ChipGroup
        testID="task-form-due-chips"
        label="Due date"
        options={QUICK_DATES}
        value={quickDateFor(dueDate, now)}
        onChange={(choice) =>
          setValue('dueDate', quickDateValue(choice, now), {
            shouldDirty: true,
            shouldValidate: true,
          })
        }
      />
      <Controller
        control={control}
        name="dueDate"
        render={({ field }) => (
          <Input
            testID="task-form-due-date"
            label="Or type a date"
            placeholder="YYYY-MM-DD"
            helperText="Leave empty for no due date."
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="numbers-and-punctuation"
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={errors.dueDate?.message}
          />
        )}
      />

      <Controller
        control={control}
        name="priority"
        render={({ field }) => (
          <ChipGroup
            testID="task-form-priority"
            label="Priority"
            options={TASK_PRIORITIES}
            value={field.value}
            onChange={field.onChange}
          />
        )}
      />

      {errors.root?.message ? (
        <Text accessibilityRole="alert" className="text-sm text-danger">
          {errors.root.message}
        </Text>
      ) : null}

      <Button
        testID="task-form-submit"
        label={submitLabel}
        loading={isSubmitting}
        onPress={() => submit()}
      />
    </View>
  );
}
