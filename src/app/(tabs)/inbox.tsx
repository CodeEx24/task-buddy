import { TaskListScreen } from '@/features/tasks/components/TaskListScreen';

/** Inbox tab (TB-27): tasks without a due date. */
export default function InboxRoute() {
  return <TaskListScreen kind="inbox" />;
}
