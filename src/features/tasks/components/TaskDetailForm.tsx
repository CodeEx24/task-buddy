import { zodResolver } from '@hookform/resolvers/zod';
import { useImperativeHandle, useMemo, type Ref } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { Text, View } from 'react-native';

import { useAutosave, type Autosave } from '@/lib/use-autosave';

import { useUpdateTask } from '../hooks/use-task-mutations';
import type { Task } from '../repo/task-repo';
import {
  changedTaskFields,
  taskFormSchema,
  toTaskFields,
  toTaskFormValues,
  type ParsedTaskForm,
  type TaskFormValues,
} from '../task-form';
import { SAVE_FAILED_MESSAGE } from './TaskForm';
import { TaskFormFields } from './TaskFormFields';

export const SAVED_MESSAGE = 'All changes saved';
export const SAVING_MESSAGE = 'Saving…';

export type TaskDetailFormProps = {
  task: Task;
  /** `flush()` saves a change still waiting for the autosave delay (used before deleting). */
  ref?: Ref<Autosave>;
};

/**
 * The task's editable fields on the detail screen (TB-28): title, due date, priority and notes.
 * No Save button: valid changes autosave 500 ms after the last keystroke, and a waiting change is
 * saved when the screen closes. Invalid values show their error and are not saved.
 * Mount with `key={task.id}`: the form is seeded once, never re-seeded on refetch.
 */
export function TaskDetailForm({ task, ref }: TaskDetailFormProps) {
  const update = useUpdateTask();
  const form = useForm<TaskFormValues, unknown, ParsedTaskForm>({
    resolver: zodResolver(taskFormSchema),
    defaultValues: toTaskFormValues(task),
    // Errors show while typing, since nothing is submitted.
    mode: 'onChange',
  });
  const values = useWatch({ control: form.control });

  // What still differs from the stored (optimistically updated) task, or null when nothing does
  // or the values are not valid yet.
  const pending = useMemo(() => {
    const parsed = taskFormSchema.safeParse(values);
    if (!parsed.success) return null;
    const patch = changedTaskFields(toTaskFields(parsed.data), task);
    return Object.keys(patch).length === 0 ? null : patch;
  }, [values, task]);

  const autosave = useAutosave(pending, (patch) => update.mutateAsync({ id: task.id, patch }));
  useImperativeHandle(ref, () => autosave, [autosave]);

  let status: { text: string; isError: boolean } | null = null;
  if (update.isError) status = { text: SAVE_FAILED_MESSAGE, isError: true };
  else if (pending !== null || update.isPending) status = { text: SAVING_MESSAGE, isError: false };
  else if (update.isSuccess) status = { text: SAVED_MESSAGE, isError: false };

  return (
    <View className="gap-lg" testID="task-detail-form">
      <TaskFormFields form={form} />
      {status ? (
        <Text
          testID="task-detail-save-status"
          accessibilityRole={status.isError ? 'alert' : undefined}
          accessibilityLiveRegion="polite"
          className={`text-sm ${status.isError ? 'text-danger' : 'text-text-muted'}`}
        >
          {status.text}
        </Text>
      ) : null}
    </View>
  );
}
