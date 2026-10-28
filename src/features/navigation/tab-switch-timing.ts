/**
 * Dev-only tab-switch timing (TB-18, AC1 "renders in under 300 ms").
 *
 * `markPress` runs on the tab bar's `tabPress` event. `reportFocus` runs on the first animation
 * frame after the target tab gains focus and logs `[tab-switch] <tab> <ms>ms`. The coordinator
 * reads these lines from the Android emulator (production-mode JS bundle) and records p95 in
 * `docs/tickets/TB-18/verification.md`. Only tab route names are logged, never task data.
 * Disabled in release builds unless explicitly opted in (see `isTabTimingEnabled`).
 */

export const TAB_SWITCH_LOG_PREFIX = '[tab-switch]';

export type TabSwitchTimer = {
  /** Records the moment a tab was pressed. */
  markPress: (tabName: string) => void;
  /** Logs and returns the elapsed ms since the matching press, or `undefined` if none is pending. */
  reportFocus: (tabName: string) => number | undefined;
};

export type TabSwitchTimerDeps = {
  now: () => number;
  log: (message: string) => void;
  isEnabled: boolean;
};

export function createTabSwitchTimer({ now, log, isEnabled }: TabSwitchTimerDeps): TabSwitchTimer {
  let pending: { tabName: string; startedAt: number } | undefined;

  return {
    markPress(tabName) {
      if (!isEnabled) return;
      pending = { tabName, startedAt: now() };
    },
    reportFocus(tabName) {
      if (!isEnabled || pending?.tabName !== tabName) return undefined;
      const elapsedMs = now() - pending.startedAt;
      pending = undefined;
      log(`${TAB_SWITCH_LOG_PREFIX} ${tabName} ${elapsedMs.toFixed(1)}ms`);
      return elapsedMs;
    },
  };
}

/**
 * On in development, and in a production-mode bundle only when explicitly opted in for the
 * measurement run: `EXPO_PUBLIC_TAB_TIMING=1 pnpm start --no-dev --minify` (non-secret flag,
 * inlined at bundle time). Never set for store or OTA builds.
 */
export function isTabTimingEnabled(isDev: boolean, flag: string | undefined): boolean {
  return isDev || flag === '1';
}

export const tabSwitchTimer = createTabSwitchTimer({
  now: () => performance.now(),
  // Measurement output only; it logs tab route names and elapsed ms, nothing else.
  log: (message) => console.log(message),
  isEnabled: isTabTimingEnabled(__DEV__, process.env.EXPO_PUBLIC_TAB_TIMING),
});
