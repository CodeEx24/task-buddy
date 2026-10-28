import { router } from 'expo-router';
import { ActivityIndicator, SectionList, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Card } from '@/components/ui';
import { useNow } from '@/lib/use-now';

import { useTaskBoard } from '../hooks/use-task-board';
import { useUpdateTask } from '../hooks/use-task-mutations';
import type { Task } from '../repo/task-repo';
import { groupTaskBoard } from '../task-sections';
import { NEW_TASK_HREF, taskHref } from '../task-routes';
import { TaskRow } from './TaskRow';

/**
 * Inbox tab (TB-26): every task in sections Today (incl. overdue), Upcoming, No date and
 * Completed, plus Add task. TB-27 splits it into Today and Inbox.
 */
export function TaskListScreen() {
  const board = useTaskBoard();
  const update = useUpdateTask();
  const now = useNow();
  const sections = board.data ? groupTaskBoard(board.data, now) : [];

  const toggleDone = (task: Task, isDone: boolean) =>
    update.mutate({ id: task.id, patch: { status: isDone ? 'done' : 'open' } });
  const openTask = (task: Task) => router.push(taskHref(task.id));

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-background">
      <View testID="inbox-screen" className="flex-1">
        <View className="flex-row items-center justify-between gap-md px-xl pb-sm pt-xl">
          <Text accessibilityRole="header" className="text-2xl font-bold text-text">
            Inbox
          </Text>
          <Button
            testID="add-task-button"
            label="Add task"
            size="sm"
            onPress={() => router.push(NEW_TASK_HREF)}
          />
        </View>

        {board.isPending ? (
          <ActivityIndicator testID="task-list-loading" className="mt-xl" />
        ) : board.isError ? (
          <Card className="mx-xl" testID="task-list-error">
            <Text className="text-base text-text">{"Couldn't load your tasks."}</Text>
            <Button label="Try again" variant="secondary" onPress={() => board.refetch()} />
          </Card>
        ) : (
          <SectionList
            testID="task-list"
            sections={sections}
            keyExtractor={(task) => task.id}
            stickySectionHeadersEnabled={false}
            // Headers count as items; render a typical day without waiting for a scroll.
            initialNumToRender={30}
            keyboardShouldPersistTaps="handled"
            contentContainerClassName="px-xl pb-[96px]"
            renderSectionHeader={({ section }) => (
              <Text
                testID={`task-section-${section.key}`}
                accessibilityRole="header"
                className="pb-xs pt-lg text-lg font-semibold text-text"
              >
                {section.title}
              </Text>
            )}
            renderItem={({ item }) => (
              <TaskRow task={item} now={now} onToggleDone={toggleDone} onOpen={openTask} />
            )}
            ListEmptyComponent={
              <Card testID="task-list-empty" className="mt-lg">
                <Text className="text-base text-text-muted">
                  No tasks yet. Tap Add task to create one.
                </Text>
              </Card>
            }
          />
        )}
      </View>
    </SafeAreaView>
  );
}
