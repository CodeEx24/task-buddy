// Read-only snapshot of the signed-in user's local data for the export file (TB-53). Reads the
// device DB, so export works offline and includes changes not yet synced. Live rows only: deleted
// items (tombstones kept for undo and sync) are not part of "my data".
import { and, asc, eq, isNull } from 'drizzle-orm';

import {
  lists,
  subtasks,
  tags,
  tasks,
  taskTags,
  type ListRow,
  type SubtaskRow,
  type TagRow,
  type TaskRow,
} from '@/db/schema';
import type { TaskBuddyDb } from '@/db/types';
import { guardDb } from '@/features/tasks/repo/repo-utils';

export type ExportSnapshot = {
  lists: ListRow[];
  tasks: TaskRow[];
  subtasks: SubtaskRow[];
  tags: TagRow[];
  /** Live task ↔ live tag links. */
  taskTags: { taskId: string; tagId: string }[];
};

function readExportSnapshotUnchecked(db: TaskBuddyDb): ExportSnapshot {
  // One read transaction, so the file is a consistent snapshot even if sync writes meanwhile.
  return db.transaction((tx) => ({
    lists: tx
      .select()
      .from(lists)
      .where(isNull(lists.deletedAt))
      .orderBy(asc(lists.sortOrder), asc(lists.id))
      .all(),
    tasks: tx
      .select()
      .from(tasks)
      .where(isNull(tasks.deletedAt))
      .orderBy(asc(tasks.createdAt), asc(tasks.id))
      .all(),
    subtasks: tx
      .select({ subtask: subtasks })
      .from(subtasks)
      .innerJoin(tasks, eq(tasks.id, subtasks.taskId))
      .where(and(isNull(subtasks.deletedAt), isNull(tasks.deletedAt)))
      .orderBy(asc(subtasks.sortOrder), asc(subtasks.id))
      .all()
      .map((row) => row.subtask),
    tags: tx
      .select()
      .from(tags)
      .where(isNull(tags.deletedAt))
      .orderBy(asc(tags.name), asc(tags.id))
      .all(),
    taskTags: tx
      .select({ taskId: taskTags.taskId, tagId: taskTags.tagId })
      .from(taskTags)
      .innerJoin(tags, eq(tags.id, taskTags.tagId))
      .where(and(isNull(taskTags.deletedAt), isNull(tags.deletedAt)))
      .all(),
  }));
}

export const readExportSnapshot = guardDb(readExportSnapshotUnchecked);
