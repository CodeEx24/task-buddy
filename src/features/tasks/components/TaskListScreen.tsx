import { router, type Href } from 'expo-router';
import { useCallback } from 'react';
import {
  ActivityIndicator,
  SectionList,
  Text,
  View,
  type SectionListRenderItem,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Card } from '@/components/ui';
import { useNow } from '@/lib/use-now';

import { useTaskBoard } from '../hooks/use-task-board';
import { useUpdateTask } from '../hooks/use-task-mutations';
import { useTaskQuickAction } from '../hooks/use-task-quick-action';
import type { Task } from '../repo/task-repo';
import {
  groupInboxTasks,
  groupTodayTasks,
  type TaskBoard,
  type TaskScreenKind,
  type TaskSection,
} from '../task-sections';
import { NEW_TASK_HREF, NEW_TODAY_TASK_HREF, taskHref } from '../task-routes';
import { SwipeableTaskRow } from './SwipeableTaskRow';
import { taskMetaLine } from './TaskRow';

type ScreenConfig = {
  title: string;
  /** Prefix of every testID on the screen: both tabs stay mounted, so ids must not collide. */
  testID: string;
  addButtonTestID: string;
  /** Where Add task opens: from Today the form starts with a due date of today. */
  addHref: Href;
  group: (board: TaskBoard, now: number) => TaskSection[];
  empty: { title: string; body: string };
};

/** Copy and grouping per tab (TB-27 spec "Behaviour"). */
export const TASK_SCREENS: Record<TaskScreenKind, ScreenConfig> = {
  today: {
    title: 'Today',
    testID: 'today',
    addButtonTestID: 'today-add-task-button',
    addHref: NEW_TODAY_TASK_HREF,
    group: groupTodayTasks,
    empty: {
      title: 'Nothing planned',
      body: 'Tasks with a due date show up here. Tap Add task to plan one for today, or swipe a task in Inbox to the left to move it to tomorrow.',
    },
  },
  inbox: {
    title: 'Inbox',
    testID: 'inbox',
    addButtonTestID: 'add-task-button',
    addHref: NEW_TASK_HREF,
    group: (board) => groupInboxTasks(board),
    empty: {
      title: 'Inbox is clear',
      body: 'Tasks without a due date wait here. Tap Add task to note one down.',
    },
  },
};

/** Rows rendered before the first scroll: a typical day without waiting (headers count too). */
const INITIAL_ROWS = 30;

/**
 * The Today and Inbox tabs (TB-27): the shared task board, grouped per tab, with swipe actions on
 * every row. Both read one cached board query, so a change on one tab shows on the other at once.
 */
export function TaskListScreen({ kind }: { kind: TaskScreenKind }) {
  const config = TASK_SCREENS[kind];
  const board = useTaskBoard();
  const { mutate: updateTask } = useUpdateTask();
  const runQuickAction = useTaskQuickAction();
  const now = useNow();
  const sections = board.data ? config.group(board.data, now) : [];

  // Stable callbacks + a per-row label string: a clock tick or a change to another task leaves
  // every other memoised row untouched (both tabs stay mounted, so this matters twice).
  const toggleDone = useCallback(
    (task: Task, isDone: boolean) =>
      updateTask({ id: task.id, patch: { status: isDone ? 'done' : 'open' } }),
    [updateTask],
  );
  const openTask = useCallback((task: Task) => router.push(taskHref(task.id)), []);
  const renderItem = useCallback<SectionListRenderItem<Task, TaskSection>>(
    ({ item }) => (
      <SwipeableTaskRow
        task={item}
        meta={taskMetaLine(item, now)}
        onToggleDone={toggleDone}
        onOpen={openTask}
        onQuickAction={runQuickAction}
      />
    ),
    [now, toggleDone, openTask, runQuickAction],
  );

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-background">
      <View testID={`${config.testID}-screen`} className="flex-1">
        <View className="flex-row items-center justify-between gap-md px-xl pb-sm pt-xl">
          <Text accessibilityRole="header" className="text-2xl font-bold text-text">
            {config.title}
          </Text>
          <Button
            testID={config.addButtonTestID}
            label="Add task"
            size="sm"
            onPress={() => router.push(config.addHref)}
          />
        </View>

        {board.isPending ? (
          <ActivityIndicator testID={`${config.testID}-loading`} className="mt-xl" />
        ) : board.isError ? (
          <Card className="mx-xl" testID={`${config.testID}-error`}>
            <Text className="text-base text-text">{"Couldn't load your tasks."}</Text>
            <Button label="Try again" variant="secondary" onPress={() => board.refetch()} />
          </Card>
        ) : (
          <SectionList
            testID={`${config.testID}-list`}
            sections={sections}
            keyExtractor={(task) => task.id}
            stickySectionHeadersEnabled={false}
            initialNumToRender={INITIAL_ROWS}
            keyboardShouldPersistTaps="handled"
            contentContainerClassName="px-xl pb-[96px]"
            renderSectionHeader={({ section }) => (
              <Text
                testID={`${config.testID}-section-${section.key}`}
                accessibilityRole="header"
                className="pb-xs pt-lg text-lg font-semibold text-text"
              >
                {section.title}
              </Text>
            )}
            renderItem={renderItem}
            ListEmptyComponent={
              <Card testID={`${config.testID}-empty`} title={config.empty.title} className="mt-lg">
                <Text className="text-base text-text-muted">{config.empty.body}</Text>
              </Card>
            }
          />
        )}
      </View>
    </SafeAreaView>
  );
}
