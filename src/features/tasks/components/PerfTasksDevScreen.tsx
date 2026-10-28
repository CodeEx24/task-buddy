import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ScrollView, Text } from 'react-native';

import { Button, Card } from '@/components/ui';
import { getDb } from '@/db/client';
import { logDbError } from '@/db/db-errors';

import { taskQueryKeys } from '../hooks/task-query-keys';
import { PERF_TASK_COUNT, removePerfTasks, seedPerfTasks } from '../repo/perf-seed';

/**
 * Dev-only helper for the TB-27 AC3 scroll check: adds 500 tasks to the app DB (Today and Inbox)
 * or removes them again. The data stays when Metro is restarted in production mode.
 */
export function PerfTasksDevScreen() {
  const client = useQueryClient();
  const [status, setStatus] = useState('');

  const run = (label: string, write: () => string) => {
    try {
      setStatus(write());
    } catch (error: unknown) {
      logDbError(label, error);
      setStatus('Failed — see the log.');
    }
    void client.invalidateQueries({ queryKey: taskQueryKeys.all });
  };

  return (
    <ScrollView
      testID="perf-tasks-screen"
      className="flex-1 bg-background"
      contentContainerClassName="gap-md p-xl"
    >
      <Text accessibilityRole="header" className="text-xl font-semibold text-text">
        List performance check
      </Text>
      <Card title={`${PERF_TASK_COUNT} tasks`}>
        <Text className="text-base text-text-muted">
          Adds open tasks titled “Perf task NNN”: 20 % overdue, 20 % today, 30 % later and 30 %
          without a date (Inbox).
        </Text>
        <Button
          testID="perf-tasks-seed"
          label={`Add ${PERF_TASK_COUNT} tasks`}
          onPress={() =>
            run('perf seed', () => {
              seedPerfTasks(getDb(), Date.now());
              return `Added ${PERF_TASK_COUNT} tasks.`;
            })
          }
        />
        <Button
          testID="perf-tasks-remove"
          label="Remove perf tasks"
          variant="secondary"
          onPress={() =>
            run('perf remove', () => `Removed ${removePerfTasks(getDb(), Date.now())} tasks.`)
          }
        />
        {status ? (
          <Text testID="perf-tasks-status" className="text-base text-text">
            {status}
          </Text>
        ) : null}
      </Card>
    </ScrollView>
  );
}
