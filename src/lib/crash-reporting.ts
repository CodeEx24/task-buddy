// Crash reporting behind a vendor-neutral interface (TB-37, https://stratyge.atlassian.net/browse/TB-37).
// The app calls only this module; Sentry is the implementation (src/lib/sentry-reporter.ts).
// Without a valid EXPO_PUBLIC_SENTRY_DSN nothing is initialised: no SDK client, no network.
import type { ComponentType } from 'react';

import { getCrashReportingEnv, type AppEnv, type CrashReportingEnv } from './env';
import { sentryReporter } from './sentry-reporter';

/** Low-cardinality tags only (fixed strings, enums, counts). Never user text. */
export type CrashTags = Record<string, string | number | boolean>;

export type CrashReporterConfig = {
  dsn: string;
  environment: AppEnv | 'unknown';
};

export interface CrashReporter {
  init(config: CrashReporterConfig): void;
  captureException(error: unknown, tags?: CrashTags): void;
  wrapRoot<P extends Record<string, unknown>>(component: ComponentType<P>): ComponentType<P>;
  /** Crashes the native layer on purpose (dev / staging test trigger only). */
  nativeCrash(): void;
}

let active: CrashReporter | undefined;

/**
 * Starts crash reporting once, at app start. Returns whether it is enabled.
 * Missing or invalid DSN → disabled (returns false, sends nothing).
 */
export function initCrashReporting(
  env: CrashReportingEnv = getCrashReportingEnv(),
  reporter: CrashReporter = sentryReporter,
): boolean {
  if (active) return true;
  if (!env.sentryDsn) return false;
  reporter.init({ dsn: env.sentryDsn, environment: env.appEnv ?? 'unknown' });
  active = reporter;
  return true;
}

export function isCrashReportingEnabled(): boolean {
  return active !== undefined;
}

/** Reports a handled error. A no-op while crash reporting is disabled. */
export function captureException(error: unknown, tags?: CrashTags): void {
  active?.captureException(error, tags);
}

/** Wraps the root component (error boundary, touch breadcrumbs). Identity while disabled. */
export function wrapRoot<P extends Record<string, unknown>>(
  component: ComponentType<P>,
): ComponentType<P> {
  return active ? active.wrapRoot(component) : component;
}

export type TestCrashKind = 'js' | 'native';

export const TEST_CRASH_MESSAGE = 'TB-37 test crash';

/** The test crash route is for dev builds and the staging (preview) build, never production. */
export function isTestCrashAvailable(
  isDev: boolean = __DEV__,
  appEnv: AppEnv | undefined = getCrashReportingEnv().appEnv,
): boolean {
  return isDev || appEnv === 'development' || appEnv === 'staging';
}

/** Throws (JS) or aborts the process (native) so a report reaches Sentry. */
export function triggerTestCrash(kind: TestCrashKind): never {
  if (kind === 'native' && active) {
    active.nativeCrash();
  }
  throw new Error(`${TEST_CRASH_MESSAGE} (${kind})`);
}

/** Test-only: forget the active reporter. */
export function resetCrashReportingForTests(): void {
  active = undefined;
}
