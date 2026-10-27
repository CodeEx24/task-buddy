// Dev-only DB check (TB-21): lists the tables in the device DB (AC1 evidence) and benchmarks
// listOpenTasks on 10,000 tasks in a separate benchmark.db (AC3). Not available in release builds.
// Logic lives in src/db and src/features/tasks/repo; this route only renders it.
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { getDb, migrateDb, openBenchmarkDb } from '@/db/client';
import { logDbError } from '@/db/db-errors';
import { appliedMigrationCount, listTables } from '@/db/introspect';
import { runListBenchmark, type BenchmarkResult } from '@/features/tasks/repo/list-benchmark';

import NotFoundScreen from '../+not-found';

type DbInfo = { tables: string[]; migrations: number };

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
    <ScrollView contentContainerStyle={styles.container} testID="db-benchmark-screen">
      <Text style={styles.title} accessibilityRole="header">
        Local DB check
      </Text>
      <Text style={styles.label}>Tables in taskbuddy.db</Text>
      <Text testID="db-tables">{info ? info.tables.join(', ') : '…'}</Text>
      <Text testID="db-migrations">Migrations applied: {info ? info.migrations : '…'}</Text>

      <Pressable
        accessibilityRole="button"
        disabled={state === 'running'}
        onPress={start}
        style={styles.button}
        testID="db-benchmark-run"
      >
        <Text style={styles.buttonLabel}>
          {state === 'running' ? 'Running…' : 'Run benchmark (10,000 tasks)'}
        </Text>
      </Pressable>

      {state === 'error' ? <Text testID="db-benchmark-error">Failed. See the log.</Text> : null}
      {result ? (
        <View testID="db-benchmark-result" style={styles.result}>
          <Text>
            listOpenTasks first page ({result.pageSize} rows) × {result.runs} runs
          </Text>
          <Text style={styles.metric}>p50 {result.p50Ms} ms</Text>
          <Text style={styles.metric} testID="db-benchmark-p95">
            p95 {result.p95Ms} ms
          </Text>
          <Text style={styles.metric}>max {result.maxMs} ms</Text>
          <Text>one-list p95 {result.listP95Ms} ms</Text>
          <Text>
            seeded {result.taskCount} tasks in {result.seedMs} ms
          </Text>
        </View>
      ) : null}
    </ScrollView>
  );
}

export default function DbBenchmarkRoute() {
  return __DEV__ ? <DbBenchmarkScreen /> : <NotFoundScreen />;
}

const styles = StyleSheet.create({
  container: { padding: 24, gap: 12 },
  title: { fontSize: 20, fontWeight: '600' },
  label: { fontWeight: '600' },
  button: { padding: 12, borderRadius: 8, borderWidth: 1, alignItems: 'center' },
  buttonLabel: { fontSize: 16, fontWeight: '600' },
  result: { gap: 4 },
  metric: { fontSize: 18, fontVariant: ['tabular-nums'] },
});
