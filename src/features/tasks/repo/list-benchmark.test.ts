/// <reference types="node" />
import { openMigratedNodeDb } from '@/db/node-client';

import {
  BENCHMARK_P95_BUDGET_MS,
  BENCHMARK_RUNS,
  BENCHMARK_TASK_COUNT,
  runListBenchmark,
  seedBenchmarkTasks,
} from './list-benchmark';
import { listOpenTasks } from './task-repo';

// TB-21 AC3 regression guard (Node + better-sqlite3). The AC evidence is the device/emulator
// run of src/app/dev/db-benchmark.tsx; this keeps the query plan from regressing in CI.
describe('listOpenTasks performance', () => {
  it('serves the first page of 10,000 tasks under 50 ms at p95', () => {
    const handle = openMigratedNodeDb();
    // jest-expo's performance.now() has 1 ms resolution; use the Node high-resolution clock.
    const result = runListBenchmark(handle.db, {
      now: () => Number(process.hrtime.bigint()) / 1e6,
    });
    // Printed so the numbers can be recorded in verification.md.
    console.log(`[TB-21 benchmark] ${JSON.stringify(result)}`);
    expect(result).toMatchObject({ taskCount: BENCHMARK_TASK_COUNT, runs: BENCHMARK_RUNS });
    expect(result.p95Ms).toBeLessThan(BENCHMARK_P95_BUDGET_MS);
    expect(result.listP95Ms).toBeLessThan(BENCHMARK_P95_BUDGET_MS);
    handle.close();
  }, 60_000);

  it('uses the list-query index for every statement it issues (no full scan, no sort)', () => {
    const queries: { sql: string; params: unknown[] }[] = [];
    const handle = openMigratedNodeDb({
      logger: { logQuery: (query, params) => queries.push({ sql: query, params }) },
    });
    seedBenchmarkTasks(handle.db, 500);
    queries.length = 0;

    // First page (dated range), a page crossing into undated tasks, and an undated cursor page.
    const first = listOpenTasks(handle.db, { limit: 50 });
    expect(first.nextCursor).not.toBeNull();
    listOpenTasks(handle.db, { limit: 50, cursor: { ...first.nextCursor!, dueAt: 8.0e12 } });
    listOpenTasks(handle.db, {
      limit: 50,
      cursor: { dueAt: null, sortOrder: 0, id: '00000000-0000-7000-8000-000000000000' },
    });

    const selects = queries.filter((q) => q.sql.startsWith('select'));
    expect(selects.length).toBeGreaterThanOrEqual(4);
    for (const query of selects) {
      const plan = handle.sqlite
        .prepare(`EXPLAIN QUERY PLAN ${query.sql}`)
        .all(...query.params) as { detail: string }[];
      const details = plan.map((p) => p.detail).join('\n');
      expect(details).toContain('USING INDEX tasks_live_status_due_sort_idx');
      expect(details).not.toMatch(/SCAN tasks(?! USING)/);
      // Ordering comes from the index (id only breaks ties in the right part).
      expect(details).not.toContain('USE TEMP B-TREE FOR ORDER BY');
    }
    handle.close();
  });
});
