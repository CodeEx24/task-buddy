// Dev-only DB check (TB-21): lists the tables in the device DB (AC1 evidence) and benchmarks
// listOpenTasks on 10,000 tasks in a separate benchmark.db (AC3). Not available in release builds.
// Logic lives in src/db and src/features/tasks/repo; this route only renders it.
import { useEffect, useState } from 'react';
import { ScrollView, Text, type TextStyle } from 'react-native';

import { Button, Card } from '@/components/ui';

import { getDb, migrateDb, openBenchmarkDb } from '@/db/client';
import { logDbError } from '@/db/db-errors';
import { appliedMigrationCount, listTables } from '@/db/introspect';
import { runListBenchmark, type BenchmarkResult } from '@/features/tasks/repo/list-benchmark';

import NotFoundScreen from '../+not-found';

type DbInfo = { tables: string[]; migrations: number };

/** Fixed-width digits so timings line up (no Tailwind class for font-variant in NativeWind). */
const TABULAR: TextStyle = { fontVariant: ['tabular-nums'] };

async function readDbInfo(): Promise<DbInfo> {
  const db = getDb();
  await migrateDb(db); // no-op when DbGate already migrated
  return { tables: listTables(db), migrations: appliedMigrationCount(db) };
}

async function runBenchmark(): Promise<BenchmarkResult> {
  const { db, close } = openBenchmarkDb();
  try {
    await migrateDb(db);
    return runListBenchmark(db);
  } finally {
    close();
  }
}

function DbBenchmarkScreen() {
  const [info, setInfo] = useState<DbInfo | null>(null);
  const [result, setResult] = useState<BenchmarkResult | null>(null);
  const [state, setState] = useState<'idle' | 'running' | 'error'>('idle');

  useEffect(() => {
    readDbInfo()
      .then(setInfo)
      .catch((error: unknown) => {
        logDbError('dev db info', error);
        setState('error');
      });
  }, []);

  const start = () => {
    setState('running');
    setResult(null);
    // Let the "Running…" state paint before the synchronous benchmark blocks the JS thread.
    setTimeout(() => {
      runBenchmark()
        .then((r) => {
          console.log(`[TB-21 benchmark] ${JSON.stringify(r)}`);
          setResult(r);
          setState('idle');
        })
        .catch((error: unknown) => {
          logDbError('benchmark', error);
          setState('error');
        });
    }, 50);
  };

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="gap-md p-xl"
      testID="db-benchmark-screen"
    >
      <Text accessibilityRole="header" className="text-xl font-semibold text-text">
        Local DB check
      </Text>
      <Card title="Tables in taskbuddy.db">
        <Text className="text-base text-text" testID="db-tables">
          {info ? info.tables.join(', ') : '…'}
        </Text>
        <Text className="text-base text-text" testID="db-migrations">
          Migrations applied: {info ? info.migrations : '…'}
        </Text>
      </Card>

      <Button
        label={state === 'running' ? 'Running…' : 'Run benchmark (10,000 tasks)'}
        loading={state === 'running'}
        onPress={start}
        testID="db-benchmark-run"
      />

      {state === 'error' ? (
        <Text className="text-base text-danger" testID="db-benchmark-error">
          Failed. See the log.
        </Text>
      ) : null}
      {result ? (
        <Card testID="db-benchmark-result">
          <Text className="text-base text-text">
            listOpenTasks first page ({result.pageSize} rows) × {result.runs} runs
          </Text>
          <Text className="text-lg text-text" style={TABULAR}>
            p50 {result.p50Ms} ms
          </Text>
          <Text className="text-lg text-text" style={TABULAR} testID="db-benchmark-p95">
            p95 {result.p95Ms} ms
          </Text>
          <Text className="text-lg text-text" style={TABULAR}>
            max {result.maxMs} ms
          </Text>
          <Text className="text-base text-text-muted">one-list p95 {result.listP95Ms} ms</Text>
          <Text className="text-base text-text-muted">
            seeded {result.taskCount} tasks in {result.seedMs} ms
          </Text>
        </Card>
      ) : null}
    </ScrollView>
  );
}

export default function DbBenchmarkRoute() {
  return __DEV__ ? <DbBenchmarkScreen /> : <NotFoundScreen />;
}
