// Turns a local DB snapshot into the versioned export document (TB-53). Pure: `now` is passed in.
import { toDateInput } from '@/lib/dates';
import { APP_NAME } from '@/lib/app-info';

import type { ExportSnapshot } from '../repo/export-repo';
import {
  DATA_EXPORT_FORMAT,
  DATA_EXPORT_VERSION,
  dataExportSchema,
  type DataExport,
  type ExportedTask,
} from '../schema';

const iso = (ms: number) => new Date(ms).toISOString();

export function buildDataExport(snapshot: ExportSnapshot, now: number): DataExport {
  const tagNames = new Map(snapshot.tags.map((tag) => [tag.id, tag.name]));
  const tagsByTask = new Map<string, string[]>();
  for (const link of snapshot.taskTags) {
    const name = tagNames.get(link.tagId);
    if (name === undefined) continue;
    tagsByTask.set(link.taskId, [...(tagsByTask.get(link.taskId) ?? []), name]);
  }
  const subtasksByTask = new Map<string, ExportedTask['subtasks']>();
  for (const s of snapshot.subtasks) {
    subtasksByTask.set(s.taskId, [
      ...(subtasksByTask.get(s.taskId) ?? []),
      {
        id: s.id,
        title: s.title,
        isDone: s.isDone,
        sortOrder: s.sortOrder,
        createdAt: iso(s.createdAt),
        updatedAt: iso(s.updatedAt),
      },
    ]);
  }
  const liveListIds = new Set(snapshot.lists.map((list) => list.id));

  const document: DataExport = {
    format: DATA_EXPORT_FORMAT,
    version: DATA_EXPORT_VERSION,
    exportedAt: iso(now),
    app: APP_NAME,
    counts: {
      lists: snapshot.lists.length,
      tasks: snapshot.tasks.length,
      subtasks: snapshot.subtasks.length,
      tags: snapshot.tags.length,
    },
    lists: snapshot.lists.map((list) => ({
      id: list.id,
      name: list.name,
      color: list.color,
      sortOrder: list.sortOrder,
      createdAt: iso(list.createdAt),
      updatedAt: iso(list.updatedAt),
    })),
    tasks: snapshot.tasks.map((task) => ({
      id: task.id,
      // A task pointing at a deleted list shows in the Inbox, so it exports as Inbox too.
      listId: task.listId !== null && liveListIds.has(task.listId) ? task.listId : null,
      title: task.title,
      notes: task.notes,
      status: task.status,
      priority: task.priority,
      dueDate: task.dueAt === null ? null : toDateInput(task.dueAt),
      completedAt: task.completedAt === null ? null : iso(task.completedAt),
      sortOrder: task.sortOrder,
      createdAt: iso(task.createdAt),
      updatedAt: iso(task.updatedAt),
      tags: tagsByTask.get(task.id) ?? [],
      subtasks: subtasksByTask.get(task.id) ?? [],
    })),
    tags: snapshot.tags.map((tag) => ({ id: tag.id, name: tag.name, color: tag.color })),
  };
  // Our own output, but validated like any boundary so a schema drift fails loudly in tests.
  return dataExportSchema.parse(document);
}

/** File name for an export made at `now`, e.g. `task-buddy-export-2026-10-28.json` (local date). */
export function dataExportFileName(now: number): string {
  return `task-buddy-export-${toDateInput(now)}.json`;
}
