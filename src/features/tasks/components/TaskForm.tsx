import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { Text, View } from 'react-native';

import { Button } from '@/components/ui';

import {
  EMPTY_TASK_FORM,
  taskFormSchema,
  toTaskFields,
  type ParsedTaskForm,
  type TaskFields,
  type TaskFormValues,
} from '../task-form';
import { TaskFormFields } from './TaskFormFields';

export const SAVE_FAILED_MESSAGE = "Couldn't save. Please try again.";

export type TaskFormProps = {
  defaultValues?: TaskFormValues;
  submitLabel: string;
  /** Resolves once saved; a rejection shows a generic error and keeps the form open. */
  onSubmit: (fields: TaskFields) => Promise<void>;
};

/**
 * Add-task form (TB-26): the shared task fields plus an explicit submit.
 * React Hook Form + Zod (`taskFormSchema`); errors show under each field.
 * The detail screen edits the same fields with autosave instead (`TaskDetailForm`, TB-28).
 */
export function TaskForm({
  defaultValues = EMPTY_TASK_FORM,
  submitLabel,
  onSubmit,
}: TaskFormProps) {
  const form = useForm<TaskFormValues, unknown, ParsedTaskForm>({
    resolver: zodResolver(taskFormSchema),
    defaultValues,
  });
  const {
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = form;

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
      <TaskFormFields form={form} />

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
