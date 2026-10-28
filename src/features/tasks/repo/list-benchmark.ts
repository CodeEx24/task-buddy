// TB-21 AC3 benchmark: seed N tasks, time `listOpenTasks` (first page of the main list).
// Driver-agnostic: the dev screen runs it on expo-sqlite, Jest on better-sqlite3.
// Seeded rows contain no user data.
import { lists, tasks, type TaskRow } from '@/db/schema';
import type { TaskBuddyDb } from '@/db/types';
import { newId } from '@/lib/ids';

import { listOpenTasks } from './task-repo';

export const BENCHMARK_TASK_COUNT = 10_000;
export const BENCHMARK_RUNS = 100;
export const BENCHMARK_P95_BUDGET_MS = 50;

const LIST_COUNT = 10;
const INSERT_CHUNK = 500;

export type BenchmarkResult = {
  taskCount: number;
  runs: number;
  pageSize: number;
  p50Ms: number;
  p95Ms: number;
  maxMs: number;
  /** Same query filtered to one list (uses tasks_list_id_idx). */
  listP95Ms: number;
  seedMs: number;
};

/** Small deterministic PRNG so runs are comparable across devices. */
function prng(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0;
    return state / 2 ** 32;
  };
}

/**
 * Inserts `count` tasks (~70% dated, ~10% done, ~5% soft-deleted, ~30% in the Inbox) spread over
 * 10 lists. Returns the list ids.
 */
export function seedBenchmarkTasks(db: TaskBuddyDb, count = BENCHMARK_TASK_COUNT): string[] {
  const random = prng(21);
  const base = Date.UTC(2026, 9, 1);
  return db.transaction((tx) => {
    const listIds = Array.from({ length: LIST_COUNT }, (_, i) => {
      const id = newId();
      tx.insert(lists)
        .values({ id, createdAt: base, updatedAt: base, name: `Benchmark list ${i}`, sortOrder: i })
        .run();
      return id;
    });
    for (let start = 0; start < count; start += INSERT_CHUNK) {
      const chunk: TaskRow[] = [];
      for (let i = start; i < Math.min(start + INSERT_CHUNK, count); i++) {
        const isDone = random() < 0.1;
        chunk.push({
          id: newId(),
          createdAt: base,
          updatedAt: base,
          deletedAt: random() < 0.05 ? base : null,
          listId: random() < 0.3 ? null : (listIds[Math.floor(random() * LIST_COUNT)] ?? null),
          title: `Benchmark task ${i}`,
          notes: null,
          status: isDone ? 'done' : 'open',
          priority: Math.floor(random() * 4),
          dueAt: random() < 0.7 ? base + Math.floor(random() * 90) * 86_400_000 : null,
          completedAt: isDone ? base : null,
          sortOrder: random() * 1000,
          syncedUpdatedAt: null,
        });
      }
      tx.insert(tasks).values(chunk).run();
    }
    return listIds;
  });
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, index)] ?? 0;
}

const round = (ms: number) => Math.round(ms * 100) / 100;

/** Seeds an empty, migrated DB and times `runs` first-page list queries. */
export function runListBenchmark(
  db: TaskBuddyDb,
  options: {
    taskCount?: number;
    runs?: number;
    pageSize?: number;
    /** High-resolution clock in ms (defaults to performance.now). */
    now?: () => number;
  } = {},
): BenchmarkResult {
  const taskCount = options.taskCount ?? BENCHMARK_TASK_COUNT;
  const runs = options.runs ?? BENCHMARK_RUNS;
  const pageSize = options.pageSize ?? 100;
  const now = options.now ?? (() => performance.now());

  const seedStart = now();
  const listIds = seedBenchmarkTasks(db, taskCount);
  const seedMs = now() - seedStart;

  const time = (input: { listId?: string }) => {
    listOpenTasks(db, { ...input, limit: pageSize }); // warm-up (statement + page cache)
    const samples: number[] = [];
    for (let run = 0; run < runs; run++) {
      const start = now();
      listOpenTasks(db, { ...input, limit: pageSize });
      samples.push(now() - start);
    }
    return samples.sort((a, b) => a - b);
  };
  const samples = time({});
  const listSamples = time({ listId: listIds[0] });
  return {
    taskCount,
    runs,
    pageSize,
    p50Ms: round(percentile(samples, 50)),
    p95Ms: round(percentile(samples, 95)),
    maxMs: round(samples[samples.length - 1] ?? 0),
    listP95Ms: round(percentile(listSamples, 95)),
    seedMs: round(seedMs),
  };
}
