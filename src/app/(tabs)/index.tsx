import { TaskListScreen } from '@/features/tasks/components/TaskListScreen';

/** Today tab (TB-27): dated tasks in Overdue, Today and Later. */
export default function TodayRoute() {
  return <TaskListScreen kind="today" />;
}
