// TB-53 AC1: the export document built from a seeded local DB, and the file + share-sheet step.
import { openMigratedNodeDb, type NodeDb } from '@/db/node-client';
import { createList, softDeleteList } from '@/features/tasks/repo/list-repo';
import { addTagToTask, createTag } from '@/features/tasks/repo/tag-repo';
import {
  createSubtask,
  createTask,
  softDeleteSubtask,
  softDeleteTask,
  updateSubtask,
  updateTask,
} from '@/features/tasks/repo/task-repo';
import { parseDateInput } from '@/lib/dates';

import { disk, resetFileSharingMock, sharing } from '../testing/expo-file-sharing-mock';
import { readExportSnapshot } from '../repo/export-repo';
import { DATA_EXPORT_FORMAT, DATA_EXPORT_VERSION, dataExportSchema } from '../schema';
import { buildDataExport, dataExportFileName } from './build-data-export';
import { deleteDataExports, shareDataExport } from './share-data-export';

jest.mock(
  'expo-file-system',
  () => jest.requireActual('@/features/account/testing/expo-file-sharing-mock').fileSystem,
);
jest.mock(
  'expo-sharing',
  () => jest.requireActual('@/features/account/testing/expo-file-sharing-mock').sharing,
);

const NOW = Date.UTC(2026, 9, 28, 12, 0, 0);

let handle: NodeDb;
beforeEach(() => {
  handle = openMigratedNodeDb();
  resetFileSharingMock();
});
afterEach(() => handle.close());

/** A list with a tagged, due task and two steps; an Inbox task done; plus deleted rows. */
function seed() {
  const { db } = handle;
  const list = createList(db, { name: 'Home' });
  const dueAt = parseDateInput('2026-11-02') ?? 0;
  const task = createTask(db, {
    title: 'Pay rent',
    notes: 'Before the 5th',
    listId: list.id,
    priority: 3,
    dueAt,
  });
  createSubtask(db, { taskId: task.id, title: 'Log in to bank' });
  const done = createSubtask(db, { taskId: task.id, title: 'Transfer' });
  updateSubtask(db, done.id, { isDone: true });
  const gone = createSubtask(db, { taskId: task.id, title: 'Deleted step' });
  softDeleteSubtask(db, gone.id);
  const tag = createTag(db, { name: 'money' });
  addTagToTask(db, task.id, tag.id);

  const inbox = createTask(db, { title: 'Call mum' });
  updateTask(db, inbox.id, { status: 'done' });

  const deleted = createTask(db, { title: 'Deleted task' });
  createSubtask(db, { taskId: deleted.id, title: 'Step of a deleted task' });
  softDeleteTask(db, deleted.id);

  const oldList = createList(db, { name: 'Old list' });
  softDeleteList(db, oldList.id);
  return { list, task, inbox, tag };
}

describe('buildDataExport', () => {
  it('exports live lists, tasks (with tags and steps) and tags in a versioned document', () => {
    const { list, task, inbox, tag } = seed();
    const doc = buildDataExport(readExportSnapshot(handle.db), NOW);

    expect(dataExportSchema.safeParse(doc).success).toBe(true);
    expect(doc).toMatchObject({
      format: DATA_EXPORT_FORMAT,
      version: DATA_EXPORT_VERSION,
      exportedAt: '2026-10-28T12:00:00.000Z',
      app: 'Task Buddy',
      counts: { lists: 1, tasks: 2, subtasks: 2, tags: 1 },
    });
    expect(doc.lists).toEqual([
      expect.objectContaining({ id: list.id, name: 'Home', color: null }),
    ]);
    expect(doc.tags).toEqual([{ id: tag.id, name: 'money', color: null }]);

    const rent = doc.tasks.find((t) => t.id === task.id);
    expect(rent).toMatchObject({
      listId: list.id,
      title: 'Pay rent',
      notes: 'Before the 5th',
      status: 'open',
      priority: 3,
      dueDate: '2026-11-02',
      completedAt: null,
      tags: ['money'],
    });
    expect(rent?.subtasks.map((s) => [s.title, s.isDone])).toEqual([
      ['Log in to bank', false],
      ['Transfer', true],
    ]);
    expect(rent?.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);

    const call = doc.tasks.find((t) => t.id === inbox.id);
    expect(call).toMatchObject({
      listId: null,
      status: 'done',
      dueDate: null,
      tags: [],
      subtasks: [],
    });
    expect(call?.completedAt).not.toBeNull();
  });

  it('leaves out deleted tasks, steps, lists and the steps of deleted tasks', () => {
    seed();
    const json = JSON.stringify(buildDataExport(readExportSnapshot(handle.db), NOW));
    expect(json).not.toContain('Deleted task');
    expect(json).not.toContain('Deleted step');
    expect(json).not.toContain('Step of a deleted task');
    expect(json).not.toContain('Old list');
  });

  it('an empty DB exports an empty, valid document', () => {
    const doc = buildDataExport(readExportSnapshot(handle.db), NOW);
    expect(doc.counts).toEqual({ lists: 0, tasks: 0, subtasks: 0, tags: 0 });
    expect(doc.tasks).toEqual([]);
  });

  it('names the file after the local date', () => {
    expect(dataExportFileName(new Date(2026, 9, 28, 23, 30).getTime())).toBe(
      'task-buddy-export-2026-10-28.json',
    );
  });
});

describe('shareDataExport', () => {
  it('writes the JSON file and opens the share sheet with its file URI', async () => {
    seed();
    const result = await shareDataExport({ db: handle.db, now: NOW, dialogTitle: 'Export' });

    expect(result).toEqual({ ok: true, counts: { tasks: 2 } });
    expect(sharing.shareAsync).toHaveBeenCalledTimes(1);
    const [uri, options] = sharing.shareAsync.mock.calls[0] ?? [];
    expect(uri).toMatch(
      /^file:\/\/\/cache\/data-export\/task-buddy-export-\d{4}-\d{2}-\d{2}\.json$/,
    );
    expect(options).toEqual({
      mimeType: 'application/json',
      UTI: 'public.json',
      dialogTitle: 'Export',
    });

    const written = JSON.parse(disk.get(uri as string) ?? 'null');
    expect(dataExportSchema.parse(written).counts.tasks).toBe(2);
  });

  it('reports unavailable (and writes nothing) when the device cannot share', async () => {
    sharing.isAvailableAsync.mockResolvedValueOnce(false);
    await expect(shareDataExport({ db: handle.db, now: NOW })).resolves.toEqual({
      ok: false,
      reason: 'unavailable',
    });
    expect(sharing.shareAsync).not.toHaveBeenCalled();
    expect(disk.size).toBe(0);
  });

  it('reports failed when sharing throws, without logging task content', async () => {
    seed();
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    sharing.shareAsync.mockRejectedValueOnce(new Error('Pay rent'));
    await expect(shareDataExport({ db: handle.db, now: NOW })).resolves.toEqual({
      ok: false,
      reason: 'failed',
    });
    expect(JSON.stringify(warn.mock.calls)).not.toContain('Pay rent');
    warn.mockRestore();
  });

  it('deleteDataExports removes every export file left in the cache', async () => {
    await shareDataExport({ db: handle.db, now: NOW });
    expect(disk.size).toBe(1);
    deleteDataExports();
    expect(disk.size).toBe(0);
    expect(() => deleteDataExports()).not.toThrow();
  });
});
