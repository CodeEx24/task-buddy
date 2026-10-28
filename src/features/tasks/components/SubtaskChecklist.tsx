import { useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, Text, View } from 'react-native';

import { Button, Card, Checkbox, Input, type ButtonProps } from '@/components/ui';
import { MIN_TOUCH_TARGET } from '@/theme';

import { useSubtaskMutations, useSubtasks } from '../hooks/use-subtasks';
import type { Subtask } from '../repo/task-repo';
import { MAX_SUBTASKS_PER_TASK } from '../schema';
import { subtaskTitleSchema } from '../task-form';
import { SAVE_FAILED_MESSAGE } from './TaskForm';

export const SUBTASK_LIMIT_MESSAGE = `This task has the maximum of ${MAX_SUBTASKS_PER_TASK} steps.`;
export const COMPLETE_OFFER_MESSAGE = 'All steps are done. Complete the task too?';

/** What a screen reader hears after a move (1-based position). */
export function movedAnnouncement(title: string, position: number, count: number): string {
  return `Moved ${title} to position ${position} of ${count}`;
}

/** A small icon-like row button that still has a full touch target in both directions. */
function RowButton(props: ButtonProps) {
  return (
    <View style={{ minWidth: MIN_TOUCH_TARGET }}>
      <Button variant="ghost" size="sm" {...props} />
    </View>
  );
}

type SubtaskRowProps = {
  subtask: Subtask;
  isFirst: boolean;
  isLast: boolean;
  onToggle: (isDone: boolean) => void;
  onMove: (direction: 'up' | 'down') => void;
  onRemove: () => void;
};

function SubtaskRow({ subtask, isFirst, isLast, onToggle, onMove, onRemove }: SubtaskRowProps) {
  const { id, title } = subtask;
  return (
    <View testID={`subtask-row-${id}`} className="flex-row items-center gap-xs">
      <View className="flex-1">
        <Checkbox
          testID={`subtask-checkbox-${id}`}
          label={title}
          checked={subtask.isDone}
          onCheckedChange={onToggle}
        />
      </View>
      <RowButton
        testID={`subtask-move-up-${id}`}
        label="↑"
        accessibilityLabel={`Move ${title} up`}
        disabled={isFirst}
        onPress={() => onMove('up')}
      />
      <RowButton
        testID={`subtask-move-down-${id}`}
        label="↓"
        accessibilityLabel={`Move ${title} down`}
        disabled={isLast}
        onPress={() => onMove('down')}
      />
      <RowButton
        testID={`subtask-delete-${id}`}
        label="✕"
        accessibilityLabel={`Delete ${title}`}
        onPress={onRemove}
      />
    </View>
  );
}

export type SubtaskChecklistProps = {
  taskId: string;
  isTaskOpen: boolean;
  /** Completes the parent task; offered once every step is checked (TB-28 AC2). */
  onCompleteTask: () => void;
};

/**
 * The task's checklist of steps (TB-28): add, check, reorder (move up / down) and delete.
 * When every step is checked and the task is still open, it offers to complete the task;
 * it never completes it on its own.
 */
export function SubtaskChecklist({ taskId, isTaskOpen, onCompleteTask }: SubtaskChecklistProps) {
  const subtasks = useSubtasks(taskId);
  const { add, setDone, move, remove } = useSubtaskMutations(taskId);
  const [draft, setDraft] = useState('');
  const [draftError, setDraftError] = useState<string | undefined>();
  // "Not now" holds for the checklist as it was: adding or deleting a step (a new count) or
  // unchecking one brings the offer back once every step is checked again.
  const [dismissedAtCount, setDismissedAtCount] = useState<number | null>(null);

  if (subtasks.isPending) return <ActivityIndicator testID="subtasks-loading" />;

  const list = subtasks.data ?? [];
  const doneCount = list.filter((s) => s.isDone).length;
  const isAllDone = list.length > 0 && doneCount === list.length;
  const isAtLimit = list.length >= MAX_SUBTASKS_PER_TASK;
  const hasFailed = [add, setDone, move, remove].some((m) => m.isError);
  const isOfferDismissed = dismissedAtCount === list.length;

  const addDraft = () => {
    const parsed = subtaskTitleSchema.safeParse(draft);
    if (!parsed.success) {
      setDraftError(parsed.error.issues[0]?.message);
      return;
    }
    setDraftError(undefined);
    setDraft('');
    setDismissedAtCount(null);
    add.mutate(parsed.data);
  };

  return (
    <Card testID="subtasks" title="Steps">
      {list.length > 0 ? (
        <Text testID="subtasks-progress" className="text-sm text-text-muted">
          {`${doneCount} of ${list.length} done`}
        </Text>
      ) : (
        <Text testID="subtasks-empty" className="text-sm text-text-muted">
          Break the task into small steps you can tick off.
        </Text>
      )}

      {list.map((subtask, index) => (
        <SubtaskRow
          key={subtask.id}
          subtask={subtask}
          isFirst={index === 0}
          isLast={index === list.length - 1}
          onToggle={(isDone) => {
            if (!isDone) setDismissedAtCount(null);
            setDone.mutate({ id: subtask.id, isDone });
          }}
          onMove={(direction) => {
            move.mutate({ id: subtask.id, direction });
            const position = index + (direction === 'up' ? 0 : 2);
            AccessibilityInfo.announceForAccessibility(
              movedAnnouncement(subtask.title, position, list.length),
            );
          }}
          onRemove={() => {
            setDismissedAtCount(null);
            remove.mutate(subtask.id);
          }}
        />
      ))}

      {isAllDone && isTaskOpen && !isOfferDismissed ? (
        <View
          testID="subtasks-complete-offer"
          accessibilityLiveRegion="polite"
          className="gap-sm rounded-md border border-primary p-md"
        >
          <Text className="text-base text-text">{COMPLETE_OFFER_MESSAGE}</Text>
          <View className="flex-row gap-sm">
            <Button
              testID="subtasks-complete-offer-accept"
              label="Complete task"
              size="sm"
              onPress={onCompleteTask}
            />
            <Button
              testID="subtasks-complete-offer-dismiss"
              label="Not now"
              variant="ghost"
              size="sm"
              onPress={() => setDismissedAtCount(list.length)}
            />
          </View>
        </View>
      ) : null}

      {isAtLimit ? (
        <Text testID="subtasks-limit" className="text-sm text-text-muted">
          {SUBTASK_LIMIT_MESSAGE}
        </Text>
      ) : (
        <View className="gap-sm">
          <Input
            testID="subtask-add-input"
            label="New step"
            placeholder="e.g. Find the bill"
            value={draft}
            onChangeText={(text) => {
              setDraft(text);
              if (draftError) setDraftError(undefined);
            }}
            onSubmitEditing={addDraft}
            submitBehavior="submit"
            returnKeyType="done"
            error={draftError}
          />
          <Button
            testID="subtask-add-button"
            label="Add step"
            variant="secondary"
            onPress={addDraft}
          />
        </View>
      )}

      {hasFailed ? (
        <Text accessibilityRole="alert" className="text-sm text-danger">
          {SAVE_FAILED_MESSAGE}
        </Text>
      ) : null}
    </Card>
  );
}
