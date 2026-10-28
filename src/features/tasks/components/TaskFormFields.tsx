import { Controller, useWatch, type UseFormReturn } from 'react-hook-form';

import { ChipGroup, Input, type ChipOption } from '@/components/ui';
import { addLocalDays, toDateInput } from '@/lib/dates';
import { useNow } from '@/lib/use-now';

import { TASK_PRIORITIES } from '../priority';
import type { ParsedTaskForm, TaskFormValues } from '../task-form';

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

export type TaskFormFieldsProps = {
  form: UseFormReturn<TaskFormValues, unknown, ParsedTaskForm>;
};

/**
 * The task fields shared by the add form (TB-26) and the autosaving detail screen (TB-28): title,
 * due date (quick chips or `YYYY-MM-DD`), priority and notes. Errors show under each field.
 */
export function TaskFormFields({ form }: TaskFormFieldsProps) {
  const {
    control,
    setValue,
    formState: { errors },
  } = form;
  const now = useNow();
  const dueDate = useWatch({ control, name: 'dueDate' });

  return (
    <>
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

      <Controller
        control={control}
        name="notes"
        render={({ field }) => (
          <Input
            testID="task-form-notes"
            label="Notes"
            placeholder="Anything that helps: links, addresses, context…"
            multiline
            numberOfLines={4}
            textAlignVertical="top"
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={errors.notes?.message}
          />
        )}
      />
    </>
  );
}
